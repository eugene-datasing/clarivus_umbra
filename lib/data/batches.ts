import { prisma } from "@/lib/db/prisma";

/**
 * List active (non-soft-deleted) batches.
 *
 * Soft-deleted batches are filtered out by default; admin Trash views should
 * call a dedicated helper (Phase 6) that includes them.
 */
export async function getBatches() {
  const batches = await prisma.batch.findMany({
    where: { deletedAt: null },
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
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
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
 * Status transitions (Umbra v1, simplified from the LGOIMA milestone flow):
 *   - Any document pending|processing -> batch "processing"
 *   - All documents signed-off (excluding excluded) -> batch "reviewed"
 *   - All documents ready (none in in-review|reviewed|signed-off) -> batch "ready-for-review"
 *   - Any export job complete -> batch "exported"
 *
 * Soft-deleted batches and batches in `draft` are not recomputed; `deleted`
 * is set by the soft-delete action, not here.
 */
export async function recomputeBatchStatus(batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { status: true, deletedAt: true },
  });
  if (!batch) return;
  if (batch.deletedAt !== null) return;
  if (batch.status === "draft" || batch.status === "deleted") return;

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
    }
    return;
  }

  const docs = await prisma.document.findMany({
    where: { batchId, status: { notIn: ["excluded"] } },
    select: { status: true },
  });
  if (docs.length === 0) return;

  const statuses: string[] = docs.map((d) => d.status);
  const hasProcessingOrPending = statuses.some((s) => s === "processing" || s === "pending");
  const allSignedOff = statuses.every((s) => s === "signed-off");
  const everyReady = statuses.every((s) => s === "ready");
  const noneInReviewOrLater = !statuses.some(
    (s) => s === "in-review" || s === "reviewed" || s === "signed-off",
  );
  const allReady = everyReady && noneInReviewOrLater;

  let newStatus: string | null = null;
  if (hasProcessingOrPending) {
    newStatus = "processing";
  } else if (allSignedOff) {
    newStatus = "reviewed";
  } else if (allReady) {
    newStatus = "ready-for-review";
  } else {
    // Mixed states (some ready, some in-review/reviewed but not all signed-off) -> leave alone
    return;
  }

  if (newStatus !== batch.status) {
    await prisma.batch.update({
      where: { id: batchId },
      data: { status: newStatus },
    });
  }
}
