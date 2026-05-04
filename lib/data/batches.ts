import { prisma } from "@/lib/db/prisma";
import {
  getAutoRedactConfig,
  resolveRequireExportConfirmation,
} from "@/lib/data/settings";
import { getBoss, QUEUE_AUTO_EXPORT_BATCH, type AutoExportBatchPayload } from "@/lib/jobs/runner";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "data/batches" });

/**
 * List active (non-soft-deleted) batches.
 *
 * Soft-deleted batches are filtered out by default. Admin views can pass
 * `{ includeDeleted: true }` to receive everything; the Trash view should
 * call `getBatchesInTrash()` instead, which inverts the filter.
 */
export async function getBatches(options: { includeDeleted?: boolean } = {}) {
  const where = options.includeDeleted ? {} : { deletedAt: null };
  const batches = await prisma.batch.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return batches.map((b) => ({
    id: b.id,
    reference: b.reference,
    name: b.name,
    status: b.status,
    documentCount: b.documentCount,
    reviewedCount: b.reviewedCount,
    redactionCount: b.redactionCount,
    deletedAt: b.deletedAt ? b.deletedAt.toISOString() : null,
    purgeScheduledAt: b.purgeScheduledAt ? b.purgeScheduledAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));
}

/**
 * List soft-deleted batches that have not yet been hard-purged. Used
 * by the admin Retention page's Trash table.
 */
export async function getBatchesInTrash() {
  const batches = await prisma.batch.findMany({
    where: { deletedAt: { not: null }, purgedAt: null },
    orderBy: { deletedAt: "desc" },
  });

  return batches.map((b) => ({
    id: b.id,
    reference: b.reference,
    name: b.name,
    status: b.status,
    documentCount: b.documentCount,
    redactionCount: b.redactionCount,
    deletedAt: b.deletedAt!.toISOString(),
    purgeScheduledAt: b.purgeScheduledAt
      ? b.purgeScheduledAt.toISOString()
      : null,
    purgeStatus: b.purgeStatus,
  }));
}

export async function getBatch(id: string) {
  const b = await prisma.batch.findUnique({ where: { id } });
  if (!b) return null;

  return {
    id: b.id,
    reference: b.reference,
    name: b.name,
    status: b.status,
    documentCount: b.documentCount,
    reviewedCount: b.reviewedCount,
    redactionCount: b.redactionCount,
    deletedAt: b.deletedAt ? b.deletedAt.toISOString() : null,
    purgeScheduledAt: b.purgeScheduledAt ? b.purgeScheduledAt.toISOString() : null,
    purgedAt: b.purgedAt ? b.purgedAt.toISOString() : null,
    purgeStatus: b.purgeStatus,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/**
 * Generate the next batch reference number for the current year.
 * Format: BATCH-YYYY-NNN (zero-padded 3 digits, monotonically increasing per year).
 */
export async function getNextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const latestBatch = await prisma.batch.findFirst({
    where: { reference: { startsWith: `BATCH-${year}` } },
    orderBy: { reference: "desc" },
  });

  if (!latestBatch) return `BATCH-${year}-001`;

  const lastNum = parseInt(latestBatch.reference.split("-").pop() || "0", 10);
  return `BATCH-${year}-${String(lastNum + 1).padStart(3, "0")}`;
}

export async function getDashboardStats() {
  const [totalBatches, activeBatches, totalDocuments, totalDetections] = await Promise.all([
    prisma.batch.count({ where: { deletedAt: null } }),
    prisma.batch.count({
      where: {
        deletedAt: null,
        status: { in: ["processing", "ready-for-review", "reviewed"] },
      },
    }),
    prisma.batch.aggregate({
      where: { deletedAt: null },
      _sum: { documentCount: true },
    }),
    prisma.batch.aggregate({
      where: { deletedAt: null },
      _sum: { redactionCount: true },
    }),
  ]);

  const batchesByStatus = await prisma.batch.groupBy({
    where: { deletedAt: null },
    by: ["status"],
    _count: true,
  });

  return {
    totalBatches,
    activeBatches,
    totalDocuments: totalDocuments._sum.documentCount || 0,
    totalDetections: totalDetections._sum.redactionCount || 0,
    batchesByStatus: Object.fromEntries(batchesByStatus.map((s) => [s.status, s._count])),
  };
}

/**
 * Recompute the batch status based on the aggregate state of its documents
 * and export jobs. Called after document/export status transitions to keep
 * the batch status in sync.
 *
 * Status transitions (Umbra v2, Phase 12.2):
 *   - Any document pending|processing -> batch "processing"
 *   - All documents auto-redacted -> batch "auto-redacted" (Phase 12.2)
 *   - All documents signed-off OR auto-redacted (mixed) -> batch "reviewed"
 *   - All documents ready (none in in-review|reviewed|signed-off|auto-redacted) -> batch "ready-for-review"
 *   - Any export job complete -> batch "exported"
 *
 * Soft-deleted batches and batches in `draft` are not recomputed; `deleted`
 * is set by the soft-delete action, not here.
 *
 * Returns the new status if a transition occurred (or the status is
 * unchanged but recomputed), or null if no transition was applicable.
 * Callers (e.g. the auto-export trigger) use the return value to decide
 * whether to fire follow-on side effects.
 */
export async function recomputeBatchStatus(batchId: string): Promise<string | null> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      status: true,
      deletedAt: true,
      requireExportConfirmation: true,
    },
  });
  if (!batch) return null;
  if (batch.deletedAt !== null) return null;
  if (batch.status === "draft" || batch.status === "deleted") return null;

  // Any export job complete -> batch "exported"
  const completedExport = await prisma.exportJob.findFirst({
    where: { batchId, status: "complete" },
    select: { id: true },
  });
  if (completedExport) {
    if (batch.status !== "exported") {
      await prisma.batch.update({
        where: { id: batchId },
        data: { status: "exported" },
      });
      return "exported";
    }
    return null;
  }

  const docs = await prisma.document.findMany({
    where: { batchId, status: { notIn: ["excluded"] } },
    select: { status: true },
  });
  if (docs.length === 0) return null;

  const statuses: string[] = docs.map((d) => d.status);
  const hasProcessingOrPending = statuses.some((s) => s === "processing" || s === "pending");
  // Phase 12.5.1 — any errored doc blocks auto-redacted/auto-export
  // promotion. The privacy contract is that auto-redact only fires when
  // the full pipeline (including AI) succeeded for every doc; one
  // errored doc keeps the batch surface in "processing" so the
  // reviewer sees it and can retry.
  const hasError = statuses.some((s) => s === "error");
  const allAutoRedacted = statuses.every((s) => s === "auto-redacted");
  const allDone = statuses.every((s) => s === "signed-off" || s === "auto-redacted");
  const allSignedOff = statuses.every((s) => s === "signed-off");
  const everyReady = statuses.every((s) => s === "ready");
  const noneInReviewOrLater = !statuses.some(
    (s) =>
      s === "in-review" ||
      s === "reviewed" ||
      s === "signed-off" ||
      s === "auto-redacted",
  );
  const allReady = everyReady && noneInReviewOrLater;

  let newStatus: string | null = null;
  if (hasProcessingOrPending) {
    newStatus = "processing";
  } else if (hasError) {
    // Phase 12.5.1 — at least one doc errored. Hold the batch in
    // "processing" so the surface stays visibly "in-flight" rather
    // than misleadingly promoting to a terminal state. Reviewer can
    // retry the errored doc; once it succeeds, recompute promotes
    // normally.
    newStatus = "processing";
  } else if (allAutoRedacted) {
    // Pure auto-redact path — every doc finished without reviewer
    // touch. Batch lands in "auto-redacted" so the auto-export
    // trigger can pick it up.
    newStatus = "auto-redacted";
  } else if (allSignedOff || allDone) {
    // Either all human-signed-off, or a mix of signed-off + auto-
    // redacted (some docs were trayed and then signed off, others
    // went straight through). Either way the batch is reviewed.
    newStatus = "reviewed";
  } else if (allReady) {
    newStatus = "ready-for-review";
  } else {
    // Mixed states (some ready, some in-review/reviewed but not all done) -> leave alone
    return null;
  }

  if (newStatus !== batch.status) {
    await prisma.batch.update({
      where: { id: batchId },
      data: { status: newStatus },
    });

    // Phase 12.2 — when a batch lands in "auto-redacted" and
    // autoExportEnabled is on, enqueue an auto-export job. Fire-and-
    // forget; failures must not block the status update.
    //
    // Phase 12.6b — gated additionally on the resolved
    // requireExportConfirmation policy. When the policy is true (org
    // default), the batch parks awaiting a human click via the
    // confirm-and-export action; the export job only fires
    // automatically when the policy is explicitly false (org-wide
    // opt-out or per-batch override).
    if (newStatus === "auto-redacted") {
      try {
        const config = await getAutoRedactConfig();
        const requireConfirmation = resolveRequireExportConfirmation(
          config,
          batch.requireExportConfirmation,
        );
        if (config.autoExportEnabled && !requireConfirmation) {
          const boss = await getBoss();
          const payload: AutoExportBatchPayload = { batchId };
          await boss.send(QUEUE_AUTO_EXPORT_BATCH, payload);
          log.info("Auto-export enqueued for batch", { batchId });
        } else if (config.autoExportEnabled && requireConfirmation) {
          log.info("Auto-export deferred — confirmation required", {
            batchId,
          });
        }
      } catch (err) {
        log.error("Failed to enqueue auto-export job", {
          batchId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return newStatus;
  }
  return null;
}
