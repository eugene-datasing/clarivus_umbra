"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { maskEntityText, stripPiiPatterns } from "@/lib/data/audit-sanitize";
import { createSnapshot } from "@/lib/pipeline/version-snapshot";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch, authorizeForDocument, authorizeForDetection } from "@/lib/auth/authorize";
import { isAdmin } from "@/lib/auth/roles";
import {
  acceptDetectionSchema,
  rejectDetectionSchema,
  applyGroundSchema,
  bulkDetectionSchema,
  detectionIdSchema,
  confidenceThresholdSchema,
  bulkApplyGroundToSimilarSchema,
  bulkApplyGroundByTypeSchema,
  changeDetectionTypeSchema,
  acceptRemainingSchema,
} from "@/lib/validation/schemas";
import { recomputeBatchStatus } from "@/lib/data/batches";
import { normaliseGroundToId } from "@/lib/lgoima-grounds";

// ---------------------------------------------------------------------------
// Change tracking (WP12)
// ---------------------------------------------------------------------------

async function recordHistory(
  detectionId: string,
  field: string,
  previousValue: string | null,
  newValue: string | null,
  changedBy: string,
) {
  if (previousValue === newValue) return;
  await prisma.detectionHistory.create({
    data: { detectionId, field, previousValue, newValue, changedBy },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * After any detection status change, recompute whether the parent document
 * should move to "reviewed" (all detections actioned) or stay "in-review".
 * Only touches documents already in "in-review" status — won't regress a
 * document that has been signed-off.
 */
async function recomputeDocumentStatus(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true },
  });
  if (!doc || doc.status !== "in-review") return;

  const pendingCount = await prisma.detection.count({
    where: { documentId, status: "pending" },
  });

  const totalCount = await prisma.detection.count({
    where: { documentId },
  });

  // If the document has detections and none are pending → reviewed
  if (totalCount > 0 && pendingCount === 0) {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "reviewed" },
    });
  }
}

/**
 * If a detection is reverted back to pending on a "reviewed" document,
 * move the document back to "in-review".
 */
async function regressDocumentIfNeeded(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true },
  });
  if (!doc) return;

  // If document was reviewed or in-review and a detection goes back to pending
  if (doc.status === "reviewed" || doc.status === "in-review") {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "in-review" },
    });
  }
}

// ---------------------------------------------------------------------------
// Document-level actions
// ---------------------------------------------------------------------------

/**
 * Transition a document from "ready" to "in-review" when a reviewer opens it.
 * No-ops if the document is already past "ready".
 */
export async function markDocumentInReview(documentId: string) {
  const user = await requireUser();
  await authorizeForDocument(user, documentId);
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, name: true, batchId: true },
  });
  if (!doc) return { success: false };

  if (doc.status !== "ready") return { success: true, alreadyPast: true };

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "in-review" },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "status",
    description: `Started review of document: "${doc.name}"`,
    target: doc.name,
    batchId: doc.batchId,
  });

  await recomputeBatchStatus(doc.batchId);

  return { success: true };
}

/**
 * Submit a document for senior review. Transitions from "in-review" or
 * "reviewed" (reviewer sign-off complete, awaiting final approval if configured).
 */
export async function submitForSeniorReview(documentId: string) {
  const user = await requireUser();
  await authorizeForDocument(user, documentId);
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, name: true, batchId: true },
  });
  if (!doc) throw new Error("Document not found");

  if (doc.status !== "in-review" && doc.status !== "reviewed") {
    throw new Error(`Cannot submit document in "${doc.status}" status`);
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "reviewed" },
  });

  // Create "draft" snapshot for version comparison (WP5)
  await createSnapshot(documentId, "draft", user.name);

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "status",
    description: `Reviewer signed off document: "${doc.name}"`,
    target: doc.name,
    batchId: doc.batchId,
  });

  await recomputeBatchStatus(doc.batchId);

  return { success: true };
}

/**
 * Final approval of a document. Transitions from "reviewed" to "signed-off".
 * Used by the senior reviewer (if configured) or acts as the final step.
 */
export async function signOffDocument(documentId: string) {
  const user = await requireUser();
  await authorizeForDocument(user, documentId);
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, name: true, batchId: true },
  });
  if (!doc) throw new Error("Document not found");

  if (doc.status !== "reviewed") {
    throw new Error(`Cannot sign off document in "${doc.status}" status`);
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "signed-off" },
  });

  // Create "final" snapshot for version comparison (WP5)
  await createSnapshot(documentId, "final", user.name);

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "status",
    description: `Signed off document: "${doc.name}"`,
    target: doc.name,
    batchId: doc.batchId,
  });

  await recomputeBatchStatus(doc.batchId);

  return { success: true };
}

/**
 * Senior reviewer requests changes — sends a document back to "in-review".
 */
export async function requestChanges(documentId: string, reason?: string) {
  const user = await requireUser();
  await authorizeForDocument(user, documentId);
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, name: true, batchId: true },
  });
  if (!doc) throw new Error("Document not found");

  if (doc.status !== "reviewed") {
    throw new Error(`Cannot request changes on document in "${doc.status}" status`);
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "in-review" },
  });

  await recomputeBatchStatus(doc.batchId);

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "status",
    description: `Requested changes on document: "${doc.name}"`,
    target: doc.name,
    batchId: doc.batchId,
    detail: reason ? stripPiiPatterns(reason) : undefined,
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Detection-level actions
// ---------------------------------------------------------------------------

export async function acceptDetection(detectionId: string, ground?: string) {
  const { detectionId: validId, ground: validGround } = acceptDetectionSchema.parse({ detectionId, ground });
  const user = await requireUser();
  await authorizeForDetection(user, validId);
  const detection = await prisma.detection.findUnique({
    where: { id: validId },
    include: { document: { select: { name: true, batchId: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  const appliedGround = validGround
    || (detection.suggestedGround ? normaliseGroundToId(detection.suggestedGround) : null);

  // Record change history
  await recordHistory(validId, "status", detection.status, "accepted", user.name);
  if (detection.appliedGround !== appliedGround) {
    await recordHistory(validId, "appliedGround", detection.appliedGround, appliedGround ?? null, user.name);
  }

  await prisma.detection.update({
    where: { id: validId },
    data: {
      status: "accepted",
      appliedGround,
      reviewedAt: new Date(),
    },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Accepted detection (${detection.type || "unknown"})`,
    target: detection.document.name,
    batchId: detection.document.batchId,
    detail: `Detection ${validId}, Confidence: ${detection.confidence}%, Ground: ${appliedGround}`,
  });

  await recomputeDocumentStatus(detection.documentId);

  return { success: true };
}

export async function rejectDetection(detectionId: string, reason?: string) {
  const { detectionId: validId, reason: validReason } = rejectDetectionSchema.parse({ detectionId, reason });
  const user = await requireUser();
  await authorizeForDetection(user, validId);
  const detection = await prisma.detection.findUnique({
    where: { id: validId },
    include: { document: { select: { name: true, batchId: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  await recordHistory(validId, "status", detection.status, "rejected", user.name);
  if (detection.appliedGround) {
    await recordHistory(validId, "appliedGround", detection.appliedGround, null, user.name);
  }

  await prisma.detection.update({
    where: { id: validId },
    data: {
      status: "rejected",
      appliedGround: null,
      reviewedAt: new Date(),
    },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Rejected detection (${detection.type || "unknown"})`,
    target: detection.document.name,
    batchId: detection.document.batchId,
    detail: validReason ? `Reason: ${stripPiiPatterns(validReason)}` : `Detection ${validId}`,
  });

  await recomputeDocumentStatus(detection.documentId);

  return { success: true };
}

export async function revertDetection(detectionId: string) {
  const validId = detectionIdSchema.parse(detectionId);
  const user = await requireUser();
  await authorizeForDetection(user, validId);
  const detection = await prisma.detection.findUnique({
    where: { id: validId },
    select: { documentId: true, status: true, appliedGround: true },
  });

  if (detection) {
    await recordHistory(validId, "status", detection.status, "pending", user.name);
    if (detection.appliedGround) {
      await recordHistory(validId, "appliedGround", detection.appliedGround, null, user.name);
    }
  }

  await prisma.detection.update({
    where: { id: validId },
    data: {
      status: "pending",
      appliedGround: null,
      reviewedAt: null,
    },
  });

  if (detection) {
    await regressDocumentIfNeeded(detection.documentId);
  }

  return { success: true };
}

export async function applyGround(detectionId: string, groundId: string) {
  const { detectionId: validId, groundId: validGroundId } = applyGroundSchema.parse({ detectionId, groundId });
  const user = await requireUser();
  await authorizeForDetection(user, validId);
  const detection = await prisma.detection.findUnique({
    where: { id: validId },
    select: { appliedGround: true },
  });

  if (detection) {
    await recordHistory(validId, "appliedGround", detection.appliedGround, validGroundId, user.name);
  }

  await prisma.detection.update({
    where: { id: validId },
    data: { appliedGround: validGroundId },
  });

  return { success: true };
}

export async function bulkAcceptDetections(detectionIds: string[], ground?: string) {
  const { detectionIds: validIds, ground: validGround } = bulkDetectionSchema.parse({ detectionIds, ground });
  const user = await requireUser();

  // Fetch all detections and verify they belong to the same authorized
  // case. `appliedGround` and `suggestedGround` are pulled in the same
  // query so we can resolve the per-row ground without a second
  // round-trip.
  const detections = await prisma.detection.findMany({
    where: { id: { in: validIds } },
    select: {
      id: true,
      documentId: true,
      document: { select: { batchId: true } },
      appliedGround: true,
      suggestedGround: true,
    },
  });

  if (detections.length === 0) return { count: 0 };

  // All detections must belong to the same case
  const batchIds = new Set(detections.map((d) => d.document.batchId));
  if (batchIds.size !== 1) {
    throw new Error("All detections in a bulk operation must belong to the same case");
  }
  const batchId = detections[0].document.batchId;
  await authorizeForBatch(user, batchId);

  // Resolve the ground each row should be accepted with.
  //
  // Priority (matches `acceptRemainingDetections` and `acceptDetection`):
  //   1. Explicit `validGround` argument (the bulk caller said
  //      "apply this ground to all of them") — overrides anything on
  //      the row.
  //   2. Row's existing `appliedGround` — preserved so a partial bulk
  //      doesn't clobber a previous reviewer's per-row ground.
  //   3. Row's `suggestedGround`, normalised to ID format. This is
  //      the post-2026-04-27 fix: pre-fix the bulk path used
  //      `updateMany` with `appliedGround: validGround || undefined`,
  //      which left the field unchanged when no explicit ground was
  //      passed and produced the prod-state `appliedGround=null,
  //      suggestedGround=non-null` shape that suppressed the right-
  //      pane citation (Bug 2 from PR #54 verification). Now every
  //      row gets a normalised ID written, matching the per-row paths
  //      that already had this logic.
  //   4. None of the above → leave `appliedGround` untouched
  //      (`undefined` in the Prisma update). Rare — only happens if
  //      the row has no `suggestedGround` either (e.g. a manual
  //      detection inserted without a ground).
  const validGroundId = validGround ? normaliseGroundToId(validGround) : null;
  const updates = detections.map((d) => {
    const resolvedGround =
      validGroundId ??
      d.appliedGround ??
      (d.suggestedGround ? normaliseGroundToId(d.suggestedGround) : null);
    return { id: d.id, ground: resolvedGround };
  });

  // Single transaction so concurrent bulk-accepts can't interleave —
  // either every row in this call commits with its resolved ground or
  // none do. Pre-fix the `updateMany` was already a single statement
  // (atomic by Prisma's contract); the per-row loop in a `$transaction`
  // gives the same guarantee for the new per-row logic.
  await prisma.$transaction(
    updates.map((u) =>
      prisma.detection.update({
        where: { id: u.id },
        data: {
          status: "accepted",
          // `undefined` (not `null`) means "leave the field unchanged"
          // in Prisma — preserves any pre-existing appliedGround on
          // rows that resolved to no-ground (priority 4 above).
          appliedGround: u.ground ?? undefined,
          reviewedAt: new Date(),
        },
      }),
    ),
  );

  const acceptedCount = updates.length;

  // Recompute status for all affected documents
  const docIds = [...new Set(detections.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk accepted ${acceptedCount} detection(s)`,
    target: "Bulk Review",
    batchId,
    detail: `${acceptedCount} detection(s)${validGround ? `, Ground: ${validGround}` : ""}`,
  });

  return { count: acceptedCount };
}

export async function bulkRejectDetections(detectionIds: string[]) {
  const { detectionIds: validIds } = bulkDetectionSchema.parse({ detectionIds });
  const user = await requireUser();

  // Fetch all detections and verify they belong to the same authorized case
  const detections = await prisma.detection.findMany({
    where: { id: { in: validIds } },
    select: { id: true, documentId: true, document: { select: { batchId: true } } },
  });

  if (detections.length === 0) return { count: 0 };

  const batchIds = new Set(detections.map((d) => d.document.batchId));
  if (batchIds.size !== 1) {
    throw new Error("All detections in a bulk operation must belong to the same case");
  }
  const batchId = detections[0].document.batchId;
  await authorizeForBatch(user, batchId);

  const authorizedIds = detections.map((d) => d.id);
  const result = await prisma.detection.updateMany({
    where: { id: { in: authorizedIds } },
    data: {
      status: "rejected",
      appliedGround: null,
      reviewedAt: new Date(),
    },
  });

  const docIds = [...new Set(detections.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk rejected ${result.count} detection(s)`,
    target: "Bulk Review",
    batchId,
  });

  return { count: result.count };
}

// ---------------------------------------------------------------------------
// Confidence-threshold mass redaction
// ---------------------------------------------------------------------------

/**
 * Auto-accept all pending detections above a confidence threshold.
 * Each detection gets its suggestedGround applied as appliedGround.
 * Admin-only.
 */
export async function applyConfidenceThreshold(batchId: string, threshold: number) {
  const { batchId: validBatchId, threshold: validThreshold } =
    confidenceThresholdSchema.parse({ batchId, threshold });

  const user = await requireUser();
  await authorizeForBatch(user, validBatchId);

  if (!isAdmin(user.role)) {
    throw new Error("Access denied: only admins can apply confidence thresholds");
  }

  // Find all pending detections above the threshold
  const detections = await prisma.detection.findMany({
    where: {
      document: { batchId: validBatchId },
      status: "pending",
      confidence: { gt: validThreshold },
    },
    select: {
      id: true,
      suggestedGround: true,
      documentId: true,
    },
  });

  if (detections.length === 0) {
    return { accepted: 0, documentsAffected: 0 };
  }

  // Group by suggestedGround so each batch gets the right ground applied
  const byGround = new Map<string | null, string[]>();
  for (const det of detections) {
    const ground = det.suggestedGround;
    if (!byGround.has(ground)) byGround.set(ground, []);
    byGround.get(ground)!.push(det.id);
  }

  // Bulk update per ground group
  for (const [ground, ids] of byGround) {
    await prisma.detection.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "accepted",
        appliedGround: ground ? normaliseGroundToId(ground) : null,
        reviewedAt: new Date(),
      },
    });
  }

  // Recompute document statuses
  const docIds = [...new Set(detections.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  // Audit trail
  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Applied confidence threshold ${validThreshold}%: ${detections.length} detection(s) auto-accepted`,
    target: "Bulk Review",
    batchId: validBatchId,
    detail: `Threshold: >${validThreshold}%, Documents affected: ${docIds.length}`,
  });

  return { accepted: detections.length, documentsAffected: docIds.length };
}

// ---------------------------------------------------------------------------
// Bulk apply ground to similar entity text
// ---------------------------------------------------------------------------

/**
 * Find all detections in a case where the detected text matches (case-insensitive)
 * the given entityText, and apply the ground + status.
 */
export async function bulkApplyGroundToSimilar(
  batchId: string,
  entityText: string,
  ground: string,
  action: "accept" | "reject",
): Promise<{ updatedCount: number }> {
  const validated = bulkApplyGroundToSimilarSchema.parse({
    batchId,
    entityText,
    ground,
    action,
  });

  const user = await requireUser();
  await authorizeForBatch(user, validated.batchId);

  // Find all pending detections in this case whose text matches (case-insensitive)
  const detections = await prisma.detection.findMany({
    where: {
      document: { batchId: validated.batchId },
      status: "pending",
    },
    select: {
      id: true,
      text: true,
      type: true,
      status: true,
      appliedGround: true,
      documentId: true,
    },
  });

  // Filter case-insensitive match on text
  const entityLower = validated.entityText.toLowerCase();
  const matching = detections.filter(
    (d) => d.text.toLowerCase() === entityLower,
  );

  if (matching.length === 0) {
    return { updatedCount: 0 };
  }

  const matchingIds = matching.map((d) => d.id);
  const newStatus = validated.action === "accept" ? "accepted" : "rejected";
  const appliedGround = validated.action === "accept" ? validated.ground : null;

  // Record history for each detection
  for (const det of matching) {
    await recordHistory(det.id, "status", det.status, newStatus, user.name);
    if (det.appliedGround !== appliedGround) {
      await recordHistory(
        det.id,
        "appliedGround",
        det.appliedGround,
        appliedGround,
        user.name,
      );
    }
  }

  // Bulk update
  await prisma.detection.updateMany({
    where: { id: { in: matchingIds } },
    data: {
      status: newStatus,
      appliedGround,
      reviewedAt: new Date(),
    },
  });

  // Recompute document statuses
  const docIds = [...new Set(matching.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  // Audit trail — mask entity text to prevent PII leaking into audit logs
  const maskedEntity = maskEntityText(validated.entityText, matching[0]?.type);
  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk ${newStatus} ${matching.length} detection(s) matching ${maskedEntity}`,
    target: "Bulk Review",
    batchId: validated.batchId,
    detail: `Entity: ${maskedEntity}, Ground: ${validated.ground}, Action: ${validated.action}`,
  });

  return { updatedCount: matching.length };
}

// ---------------------------------------------------------------------------
// Bulk apply ground by detection type
// ---------------------------------------------------------------------------

/**
 * Find all detections in a case matching a detection type, and apply the
 * ground + status.
 */
export async function bulkApplyGroundByType(
  batchId: string,
  detectionType: string,
  ground: string,
  action: "accept" | "reject",
): Promise<{ updatedCount: number }> {
  const validated = bulkApplyGroundByTypeSchema.parse({
    batchId,
    detectionType,
    ground,
    action,
  });

  const user = await requireUser();
  await authorizeForBatch(user, validated.batchId);

  // Find all pending detections of this type in this case
  const detections = await prisma.detection.findMany({
    where: {
      document: { batchId: validated.batchId },
      status: "pending",
      type: validated.detectionType,
    },
    select: {
      id: true,
      status: true,
      appliedGround: true,
      documentId: true,
    },
  });

  if (detections.length === 0) {
    return { updatedCount: 0 };
  }

  const matchingIds = detections.map((d) => d.id);
  const newStatus = validated.action === "accept" ? "accepted" : "rejected";
  const appliedGround = validated.action === "accept" ? validated.ground : null;

  // Record history for each detection
  for (const det of detections) {
    await recordHistory(det.id, "status", det.status, newStatus, user.name);
    if (det.appliedGround !== appliedGround) {
      await recordHistory(
        det.id,
        "appliedGround",
        det.appliedGround,
        appliedGround,
        user.name,
      );
    }
  }

  // Bulk update
  await prisma.detection.updateMany({
    where: { id: { in: matchingIds } },
    data: {
      status: newStatus,
      appliedGround,
      reviewedAt: new Date(),
    },
  });

  // Recompute document statuses
  const docIds = [...new Set(detections.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  // Audit trail
  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk ${newStatus} ${detections.length} detection(s) of type "${validated.detectionType}"`,
    target: "Bulk Review",
    batchId: validated.batchId,
    detail: `Type: "${validated.detectionType}", Ground: ${validated.ground}, Action: ${validated.action}`,
  });

  return { updatedCount: detections.length };
}

// ---------------------------------------------------------------------------
// Change detection type
// ---------------------------------------------------------------------------

/**
 * Change the type of a single detection. Used when a reviewer reclassifies
 * a detection (e.g. from "phone" to "ird").
 */
export async function changeDetectionType(
  detectionId: string,
  newType: string,
): Promise<{ success: true }> {
  const validated = changeDetectionTypeSchema.parse({ detectionId, newType });

  const user = await requireUser();
  await authorizeForDetection(user, validated.detectionId);

  const detection = await prisma.detection.findUnique({
    where: { id: validated.detectionId },
    select: { type: true },
  });
  if (!detection) throw new Error("Detection not found");

  await recordHistory(
    validated.detectionId,
    "type",
    detection.type,
    validated.newType,
    user.name,
  );

  await prisma.detection.update({
    where: { id: validated.detectionId },
    data: { type: validated.newType },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Accept remaining detections on a document
// ---------------------------------------------------------------------------

/**
 * Bulk-accept all pending detections on a document. Detections without any
 * ground (neither applied nor suggested) are skipped.
 */
export async function acceptRemainingDetections(
  documentId: string,
): Promise<{ accepted: number; skipped: number; skippedIds: string[] }> {
  const validated = acceptRemainingSchema.parse({ documentId });

  const user = await requireUser();
  await authorizeForDocument(user, validated.documentId);

  const doc = await prisma.document.findUnique({
    where: { id: validated.documentId },
    select: { name: true, batchId: true },
  });
  if (!doc) throw new Error("Document not found");

  // Fetch all pending detections for this document
  const pending = await prisma.detection.findMany({
    where: { documentId: validated.documentId, status: "pending" },
    select: {
      id: true,
      suggestedGround: true,
      appliedGround: true,
      type: true,
      text: true,
    },
  });

  const toAccept: { id: string; ground: string }[] = [];
  const skippedIds: string[] = [];

  for (const det of pending) {
    const ground =
      det.appliedGround ||
      (det.suggestedGround ? normaliseGroundToId(det.suggestedGround) : null);

    if (ground) {
      toAccept.push({ id: det.id, ground });
    } else {
      skippedIds.push(det.id);
    }
  }

  // Update each accepted detection with its specific ground
  for (const item of toAccept) {
    await prisma.detection.update({
      where: { id: item.id },
      data: {
        status: "accepted",
        appliedGround: item.ground,
        reviewedAt: new Date(),
      },
    });
  }

  await recomputeDocumentStatus(validated.documentId);

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk accepted ${toAccept.length} remaining detection(s)${skippedIds.length > 0 ? `, skipped ${skippedIds.length} without ground` : ""}`,
    target: doc.name,
    batchId: doc.batchId,
    detail: `Accepted: ${toAccept.length}, Skipped: ${skippedIds.length}`,
  });

  return {
    accepted: toAccept.length,
    skipped: skippedIds.length,
    skippedIds,
  };
}
