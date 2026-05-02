"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { getNextReference } from "@/lib/data/batches";
import { getRetentionConfig } from "@/lib/data/settings";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/authorize";
import { createBatchSchema } from "@/lib/validation/schemas";
import { getBoss, QUEUE_PURGE_BATCH } from "@/lib/jobs/runner";
import { revalidatePath } from "next/cache";

/**
 * Create a new batch. Per US-002, the user supplies a friendly `name`
 * (e.g. "May submission responses"); the system assigns a `reference`
 * (BATCH-YYYY-NNN) as the canonical identifier.
 */
export async function createBatch(data: { name: string }) {
  const validated = createBatchSchema.parse(data);
  const user = await requireUser();
  const reference = await getNextReference();

  const newBatch = await prisma.batch.create({
    data: {
      reference,
      name: validated.name,
      status: "draft",
    },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "batch-created",
    description: `Created batch "${validated.name}"`,
    target: reference,
    batchId: newBatch.id,
  });

  return { id: newBatch.id, reference };
}

// ---------------------------------------------------------------------------
// Phase 6: soft-delete / restore / purge-now
// ---------------------------------------------------------------------------

/**
 * Soft-delete a batch. Sets `deletedAt = now()` and
 * `purgeScheduledAt = now() + RETENTION_CONFIG.gracePeriodDays`.
 * Admin only. The batch becomes invisible to non-admin queries
 * immediately; the retention worker (Phase 6c) hard-deletes after
 * the grace window expires.
 */
export async function softDeleteBatch(batchId: string) {
  const user = await requireUser();
  await requireAdmin(user);

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, reference: true, deletedAt: true, purgeStatus: true },
  });
  if (!batch) throw new Error("Batch not found");
  if (batch.deletedAt !== null) {
    throw new Error("Batch is already soft-deleted");
  }
  if (batch.purgeStatus !== null) {
    throw new Error("Batch is currently being purged; cannot soft-delete");
  }

  const config = await getRetentionConfig();
  const now = new Date();
  const purgeAt = new Date(now.getTime() + config.gracePeriodDays * 86_400_000);

  await prisma.batch.update({
    where: { id: batchId },
    data: { deletedAt: now, purgeScheduledAt: purgeAt },
  });

  await createAuditEntry({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    type: "batch.soft-deleted",
    description: `Soft-deleted batch ${batch.reference}`,
    target: batch.reference,
    batchId,
    detail: `Purge scheduled for ${purgeAt.toISOString()}`,
  });

  revalidatePath("/batches");
  revalidatePath("/admin/retention");

  return { success: true, purgeScheduledAt: purgeAt.toISOString() };
}

/**
 * Restore a soft-deleted batch. Clears `deletedAt` and
 * `purgeScheduledAt`. Admin only. Refuses if the purge is already in
 * flight (`purgeStatus IS NOT NULL`).
 */
export async function restoreBatch(batchId: string) {
  const user = await requireUser();
  await requireAdmin(user);

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, reference: true, deletedAt: true, purgeStatus: true },
  });
  if (!batch) throw new Error("Batch not found");
  if (batch.deletedAt === null) {
    throw new Error("Batch is not soft-deleted");
  }
  if (batch.purgeStatus !== null) {
    throw new Error("Batch is currently being purged; cannot restore");
  }

  await prisma.batch.update({
    where: { id: batchId },
    data: { deletedAt: null, purgeScheduledAt: null },
  });

  await createAuditEntry({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    type: "batch.restored",
    description: `Restored batch ${batch.reference} from trash`,
    target: batch.reference,
    batchId,
  });

  revalidatePath("/batches");
  revalidatePath("/admin/retention");

  return { success: true };
}

/**
 * Purge a batch now. Admin only. Two modes:
 *
 *   - skipGrace: false (default) — soft-delete the batch with the
 *     standard grace window; the retention worker picks it up later.
 *   - skipGrace: true — sets `purgeScheduledAt = now()` and enqueues
 *     the purge-batch job for immediate processing. A non-empty
 *     `reason` is REQUIRED in skip-grace mode (a destructive override
 *     that must be audit-trailed beyond the button click).
 *
 * In both modes the action enqueues a "purge-batch" pg-boss job so
 * Phase 6c's worker has work to do; for the non-skip-grace path the
 * worker will see `purgeScheduledAt > now` and defer.
 */
export async function purgeNowBatch(
  batchId: string,
  options: { skipGrace?: boolean; reason?: string } = {},
) {
  const user = await requireUser();
  await requireAdmin(user);

  const skipGrace = options.skipGrace === true;
  const reason = (options.reason ?? "").trim();

  if (skipGrace && reason.length === 0) {
    throw new Error("A reason is required when skipping the grace period");
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, reference: true, purgeStatus: true },
  });
  if (!batch) throw new Error("Batch not found");
  if (batch.purgeStatus !== null) {
    throw new Error("Batch is already being purged");
  }

  const config = await getRetentionConfig();
  const now = new Date();
  const purgeAt = skipGrace
    ? now
    : new Date(now.getTime() + config.gracePeriodDays * 86_400_000);

  await prisma.batch.update({
    where: { id: batchId },
    data: { deletedAt: now, purgeScheduledAt: purgeAt },
  });

  await createAuditEntry({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    type: "batch.purge-requested",
    description: skipGrace
      ? `Purge requested (skip-grace) for batch ${batch.reference}`
      : `Purge requested for batch ${batch.reference}`,
    target: batch.reference,
    batchId,
    detail: skipGrace
      ? `Skip-grace reason: ${reason}`
      : `Purge scheduled for ${purgeAt.toISOString()}`,
  });

  try {
    const boss = await getBoss();
    await boss.send(QUEUE_PURGE_BATCH, {
      batchId,
      requestedBy: user.id,
      reason: reason || null,
      skipGrace,
    });
  } catch (err) {
    console.error("[purgeNowBatch] failed to enqueue purge job:", err);
    // Phase 6c's retention sweep will retry off the purgeScheduledAt
    // column even if the immediate enqueue fails.
  }

  revalidatePath("/batches");
  revalidatePath("/admin/retention");

  return {
    success: true,
    skipGrace,
    purgeScheduledAt: purgeAt.toISOString(),
  };
}
