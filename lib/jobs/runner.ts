/**
 * pg-boss job runner.
 *
 * Owns the lifecycle of a single in-process pg-boss instance and the
 * registration of the queues + handlers Umbra runs in the background.
 * Phase 6c replaces Phase 6a's no-op handlers with the real
 * archive + cascade-delete + blob-cleanup logic.
 *
 * pg-boss manages its own schema (`pgboss`) inside the same database
 * — it auto-creates on first start. Migrations are emitted as part
 * of `boss.start()` and don't appear in our Prisma migrations
 * folder.
 */

import { PgBoss } from "pg-boss";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { archiveAuditChain, type BatchMeta } from "./audit-archive";
import { getRetentionConfig } from "@/lib/data/settings";
import { createAuditEntry } from "@/lib/data/audit";
import { runExportForBatch } from "@/lib/pipeline/export-runner";

const log = logger.child({ module: "jobs/runner" });

export const QUEUE_PURGE_BATCH = "purge-batch";
export const QUEUE_RETENTION_SWEEP = "retention-sweep";
export const QUEUE_AUTO_EXPORT_BATCH = "auto-export-batch";

let boss: PgBoss | null = null;
let workerStarted = false;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  const instance = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: "pgboss",
    application_name: "umbra-worker",
  });

  instance.on("error", (err) => {
    log.error("[pg-boss] instance error", { error: String(err) });
  });

  await instance.start();
  log.info("[pg-boss] worker started");
  boss = instance;
  return instance;
}

export async function startWorker(): Promise<void> {
  if (workerStarted) return;
  const b = await getBoss();

  await b.createQueue(QUEUE_PURGE_BATCH);
  await b.createQueue(QUEUE_RETENTION_SWEEP);
  await b.createQueue(QUEUE_AUTO_EXPORT_BATCH);

  await b.work(QUEUE_PURGE_BATCH, async ([job]) => {
    const data = job.data as PurgeBatchPayload;
    log.info("[purge-batch] received", { jobId: job.id, batchId: data.batchId });
    try {
      await processPurgeBatch(data);
    } catch (err) {
      log.error("[purge-batch] failed", {
        jobId: job.id,
        batchId: data.batchId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  await b.work(QUEUE_RETENTION_SWEEP, async ([job]) => {
    log.info("[retention-sweep] tick", { jobId: job.id });
    try {
      await runRetentionSweep();
    } catch (err) {
      log.error("[retention-sweep] failed", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  // Phase 12.2 — auto-export queue. Fires when recomputeBatchStatus
  // transitions a batch to "auto-redacted" AND
  // AUTO_REDACT_CONFIG.autoExportEnabled is true. The handler delegates
  // to runExportForBatch (the same orchestration the manual API route
  // uses) so the validation guards + audit-integrity check + export
  // generation stay shared. On failure the job retries via pg-boss's
  // default retry policy.
  await b.work(QUEUE_AUTO_EXPORT_BATCH, async ([job]) => {
    const data = job.data as AutoExportBatchPayload;
    log.info("[auto-export-batch] received", { jobId: job.id, batchId: data.batchId });
    try {
      const result = await runExportForBatch(data.batchId, {
        generatedBy: "auto-export",
      });
      if (!result.ok) {
        log.warn("[auto-export-batch] runner declined", {
          jobId: job.id,
          batchId: data.batchId,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
        // Audit-integrity failure / blocked docs are not retryable —
        // the job has done what it can; the batch needs human attention.
        return;
      }
      log.info("[auto-export-batch] kicked off export", {
        jobId: job.id,
        batchId: data.batchId,
        exportId: result.exportId,
      });
    } catch (err) {
      log.error("[auto-export-batch] failed", {
        jobId: job.id,
        batchId: data.batchId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  await b.schedule(
    QUEUE_RETENTION_SWEEP,
    "0 * * * *",
    {},
    { tz: "Pacific/Auckland" },
  );

  log.info("[pg-boss] handlers registered");
  workerStarted = true;
}

export async function stopWorker(): Promise<void> {
  if (!boss) return;
  await boss.stop();
  boss = null;
  workerStarted = false;
}

// ---------------------------------------------------------------------------
// Purge handlers
// ---------------------------------------------------------------------------

export interface PurgeBatchPayload {
  batchId: string;
  requestedBy: string;
  reason: string | null;
  skipGrace: boolean;
}

/**
 * Phase 12.2 — auto-export job payload. Fired by recomputeBatchStatus
 * when a batch transitions to "auto-redacted" with autoExportEnabled.
 */
export interface AutoExportBatchPayload {
  batchId: string;
}

/**
 * Handle a single admin-triggered Purge Now request. Claims the
 * batch row, archives the audit chain, cascade-deletes, cleans up
 * blobs, and writes a PurgeLog row. Roundtrip-verifies the archive
 * before any data is destroyed — see audit-archive.ts.
 */
async function processPurgeBatch(payload: PurgeBatchPayload): Promise<void> {
  const claimed = await claimBatchForPurge(payload.batchId);
  if (!claimed) {
    log.warn("[purge-batch] could not claim batch (purge in flight or row gone)", {
      batchId: payload.batchId,
    });
    return;
  }

  await archiveAndPurge(payload.batchId, payload.requestedBy);
}

/**
 * Hourly sweep:
 *   1. Claim up to 10 batches whose purgeScheduledAt has elapsed.
 *   2. Archive + cascade + cleanup + PurgeLog each one.
 *   3. Run the auto-retention pass: soft-delete exported batches
 *      past their retention window so the next sweep tick can pick
 *      them up.
 */
async function runRetentionSweep(): Promise<void> {
  const claimedIds = await claimSweepBatch(10);
  log.info("[retention-sweep] claimed batches for purge", {
    count: claimedIds.length,
  });

  for (const batchId of claimedIds) {
    try {
      await archiveAndPurge(batchId, "system");
    } catch (err) {
      log.error("[retention-sweep] purge failed; leaving purgeStatus='purging'", {
        batchId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Don't rethrow — keep processing the rest of the claimed
      // batch. The failed row stays at purgeStatus='purging' for an
      // operator to investigate.
    }
  }

  await runAutoRetentionPass();
}

/**
 * SELECT ... FOR UPDATE SKIP LOCKED to claim a batch by id without
 * racing other workers. Returns true if the row was successfully
 * marked 'purging', false if it was already claimed or the row is
 * gone.
 */
async function claimBatchForPurge(batchId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM batches
      WHERE id = ${batchId}
        AND "purgeStatus" IS NULL
        AND "purgedAt" IS NULL
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return false;

    await tx.$executeRaw`
      UPDATE batches
      SET "purgeStatus" = 'purging'
      WHERE id = ${batchId}
    `;
    return true;
  });
}

/**
 * Sweep claim: finds up to `limit` rows whose purgeScheduledAt has
 * elapsed and marks them 'purging' atomically. Returns the claimed
 * ids.
 */
async function claimSweepBatch(limit: number): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM batches
      WHERE "deletedAt" IS NOT NULL
        AND "purgeScheduledAt" <= NOW()
        AND "purgeStatus" IS NULL
        AND "purgedAt" IS NULL
      ORDER BY "purgeScheduledAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `;
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    await tx.$executeRaw`
      UPDATE batches
      SET "purgeStatus" = 'purging'
      WHERE id = ANY(${ids}::text[])
    `;
    return ids;
  });
}

/**
 * Archive → cascade-delete → blob cleanup → PurgeLog. The roundtrip
 * verification is inside `archiveAuditChain`; if it throws, the
 * cascade-delete is skipped and `purgeStatus='purging'` stays on
 * the row for human follow-up.
 */
async function archiveAndPurge(batchId: string, actor: string): Promise<void> {
  const storage = getStorage();

  // Capture metadata before delete.
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      reference: true,
      name: true,
      documentCount: true,
      redactionCount: true,
      createdAt: true,
      deletedAt: true,
    },
  });
  if (!batch) {
    log.warn("[archiveAndPurge] batch row already gone", { batchId });
    return;
  }

  const meta: BatchMeta = {
    id: batch.id,
    reference: batch.reference,
    name: batch.name,
    documentCount: batch.documentCount,
    detectionCount: batch.redactionCount,
    createdAt: batch.createdAt,
    deletedAt: batch.deletedAt,
  };

  // 1. Archive the audit chain. Roundtrip verification inside.
  const archive = await archiveAuditChain(batchId, meta, actor);

  // 2. Cascade-delete the Batch row. Phase 2 cascades clean up
  //    Document, DocumentPage, Detection, DetectionHistory,
  //    AuditEntry, ExportJob, FileUpload, BatchMilestone.
  await prisma.batch.delete({ where: { id: batchId } });
  log.info("[archiveAndPurge] cascade-delete complete", { batchId });

  // 3. Best-effort blob cleanup under the batch's data prefix. We
  //    deliberately do NOT touch `archives/{YYYY}/{batchId}/...` —
  //    that's the artefact we just wrote and it must survive.
  const dataKeys = await storage.listByPrefix(`${batchId}/`);
  let deleted = 0;
  let failed = 0;
  for (const key of dataKeys) {
    try {
      await storage.delete(key);
      deleted += 1;
    } catch (err) {
      failed += 1;
      log.warn("[archiveAndPurge] blob delete failed (continuing)", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  log.info("[archiveAndPurge] blob cleanup complete", {
    batchId,
    deleted,
    failed,
  });

  // 4. Write the PurgeLog row. Survives the cascade by design — no
  //    FK to Batch.
  await prisma.purgeLog.create({
    data: {
      batchId: batch.id,
      batchRef: batch.reference,
      archivePath: archive.archivePath,
      totalEntries: archive.totalEntries,
      chainValid: archive.chainValid,
      archivedBy: actor,
    },
  });
  log.info("[archiveAndPurge] purge log written", {
    batchId,
    archivePath: archive.archivePath,
  });
}

// ---------------------------------------------------------------------------
// Auto-retention sweep
// ---------------------------------------------------------------------------

/**
 * Walk the active-batch table and soft-delete any batch that has
 * been in `status='exported'` longer than `retentionDaysAfterCompletion`.
 * The standard grace window applies — the next sweep tick will
 * pick them up for archival.
 */
async function runAutoRetentionPass(): Promise<void> {
  const config = await getRetentionConfig();
  if (!config.autoRetentionEnabled) {
    log.info("[auto-retention] disabled; skipping");
    return;
  }

  const now = new Date();
  const cutoff = new Date(
    now.getTime() - config.retentionDaysAfterCompletion * 86_400_000,
  );

  const candidates = await prisma.batch.findMany({
    where: {
      status: "exported",
      updatedAt: { lt: cutoff },
      deletedAt: null,
      purgeStatus: null,
    },
    select: { id: true, reference: true },
  });

  if (candidates.length === 0) {
    log.info("[auto-retention] no candidates");
    return;
  }

  log.info("[auto-retention] soft-deleting candidates", {
    count: candidates.length,
  });

  const purgeAt = new Date(now.getTime() + config.gracePeriodDays * 86_400_000);

  for (const c of candidates) {
    try {
      await prisma.batch.update({
        where: { id: c.id, deletedAt: null, purgeStatus: null },
        data: { deletedAt: now, purgeScheduledAt: purgeAt },
      });
      await createAuditEntry({
        userName: "system",
        userRole: "system",
        type: "batch.auto-retention-soft-deleted",
        description: `Auto-retention soft-deleted batch ${c.reference}`,
        target: c.reference,
        batchId: c.id,
        detail: `status=exported, retention window ${config.retentionDaysAfterCompletion}d elapsed; purge scheduled for ${purgeAt.toISOString()}`,
      });
    } catch (err) {
      log.warn("[auto-retention] failed to soft-delete (raced or already changed)", {
        batchId: c.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
