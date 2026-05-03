"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { maskEntityText, stripPiiPatterns } from "@/lib/data/audit-sanitize";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch, authorizeForDocument, authorizeForDetection } from "@/lib/auth/authorize";
import { isAdmin } from "@/lib/auth/roles";
import {
  acceptDetectionSchema,
  rejectDetectionSchema,
  bulkDetectionSchema,
  detectionIdSchema,
  confidenceThresholdSchema,
  changeDetectionTypeSchema,
  acceptRemainingSchema,
} from "@/lib/validation/schemas";
import { recomputeBatchStatus } from "@/lib/data/batches";

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
 * should move forward in the state machine. Only touches documents in
 * "in-review" status — won't regress signed-off, won't disturb auto-
 * redacted (admin override of an auto-accepted detection regresses
 * via `regressDocumentIfNeeded` which fires on the same call paths).
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
 * If a detection is reverted back to pending, move the document back to
 * an in-review-style state. Phase 12.2: an admin overriding a
 * previously-auto-accepted detection on an "auto-redacted" document
 * regresses the document to "in-review" — once a human is intervening,
 * the auto-redacted contract no longer holds and the doc needs the
 * full review path.
 */
async function regressDocumentIfNeeded(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true },
  });
  if (!doc) return;

  if (
    doc.status === "reviewed" ||
    doc.status === "in-review" ||
    doc.status === "auto-redacted" ||
    doc.status === "ready"
  ) {
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
 * Reviewer signs off a document — transitions from "in-review" or
 * "reviewed" to "reviewed" (Umbra v1's flow has no separate senior
 * review stage; this preserves the action for callers but is now
 * idempotent on already-reviewed documents).
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
 * Final sign-off of a document. Transitions from "reviewed" to "signed-off".
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

/**
 * Accept a detection. Umbra v1 collapses the LGOIMA "ground" concept — the
 * `ground` parameter is accepted for schema compatibility but ignored
 * server-side until Phase 7 reframes the export pipeline.
 */
export async function acceptDetection(detectionId: string, ground?: string) {
  const { detectionId: validId } = acceptDetectionSchema.parse({ detectionId, ground });
  const user = await requireUser();
  await authorizeForDetection(user, validId);
  const detection = await prisma.detection.findUnique({
    where: { id: validId },
    include: { document: { select: { name: true, batchId: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  await recordHistory(validId, "status", detection.status, "accepted", user.name);

  await prisma.detection.update({
    where: { id: validId },
    data: {
      status: "accepted",
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
    detail: `Detection ${validId}, Confidence: ${detection.confidence}%`,
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

  await prisma.detection.update({
    where: { id: validId },
    data: {
      status: "rejected",
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
    select: { documentId: true, status: true },
  });

  if (detection) {
    await recordHistory(validId, "status", detection.status, "pending", user.name);
  }

  await prisma.detection.update({
    where: { id: validId },
    data: {
      status: "pending",
      reviewedAt: null,
    },
  });

  if (detection) {
    await regressDocumentIfNeeded(detection.documentId);
  }

  return { success: true };
}

export async function bulkAcceptDetections(detectionIds: string[], ground?: string) {
  const { detectionIds: validIds } = bulkDetectionSchema.parse({ detectionIds, ground });
  const user = await requireUser();

  const detections = await prisma.detection.findMany({
    where: { id: { in: validIds } },
    select: {
      id: true,
      documentId: true,
      document: { select: { batchId: true } },
    },
  });

  if (detections.length === 0) return { count: 0 };

  // All detections must belong to the same batch
  const batchIds = new Set(detections.map((d) => d.document.batchId));
  if (batchIds.size !== 1) {
    throw new Error("All detections in a bulk operation must belong to the same batch");
  }
  const batchId = detections[0].document.batchId;
  await authorizeForBatch(user, batchId);

  const result = await prisma.detection.updateMany({
    where: { id: { in: detections.map((d) => d.id) } },
    data: {
      status: "accepted",
      reviewedAt: new Date(),
    },
  });

  // Recompute status for all affected documents
  const docIds = [...new Set(detections.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk accepted ${result.count} detection(s)`,
    target: "Bulk Review",
    batchId,
    detail: `${result.count} detection(s)`,
  });

  return { count: result.count };
}

export async function bulkRejectDetections(detectionIds: string[]) {
  const { detectionIds: validIds } = bulkDetectionSchema.parse({ detectionIds });
  const user = await requireUser();

  const detections = await prisma.detection.findMany({
    where: { id: { in: validIds } },
    select: { id: true, documentId: true, document: { select: { batchId: true } } },
  });

  if (detections.length === 0) return { count: 0 };

  const batchIds = new Set(detections.map((d) => d.document.batchId));
  if (batchIds.size !== 1) {
    throw new Error("All detections in a bulk operation must belong to the same batch");
  }
  const batchId = detections[0].document.batchId;
  await authorizeForBatch(user, batchId);

  const authorizedIds = detections.map((d) => d.id);
  const result = await prisma.detection.updateMany({
    where: { id: { in: authorizedIds } },
    data: {
      status: "rejected",
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
// Confidence-threshold mass acceptance
// ---------------------------------------------------------------------------

/**
 * Auto-accept all pending detections above a confidence threshold. Admin-only.
 */
export async function applyConfidenceThreshold(batchId: string, threshold: number) {
  const { batchId: validBatchId, threshold: validThreshold } =
    confidenceThresholdSchema.parse({ batchId, threshold });

  const user = await requireUser();
  await authorizeForBatch(user, validBatchId);

  if (!isAdmin(user.role)) {
    throw new Error("Access denied: only admins can apply confidence thresholds");
  }

  const detections = await prisma.detection.findMany({
    where: {
      document: { batchId: validBatchId },
      status: "pending",
      confidence: { gt: validThreshold },
    },
    select: { id: true, documentId: true },
  });

  if (detections.length === 0) {
    return { accepted: 0, documentsAffected: 0 };
  }

  await prisma.detection.updateMany({
    where: { id: { in: detections.map((d) => d.id) } },
    data: {
      status: "accepted",
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
    description: `Applied confidence threshold ${validThreshold}%: ${detections.length} detection(s) auto-accepted`,
    target: "Bulk Review",
    batchId: validBatchId,
    detail: `Threshold: >${validThreshold}%, Documents affected: ${docIds.length}`,
  });

  return { accepted: detections.length, documentsAffected: docIds.length };
}

// ---------------------------------------------------------------------------
// Bulk accept by similar entity text
// ---------------------------------------------------------------------------

/**
 * Find all detections in a batch whose detected text matches (case-insensitive)
 * the given entityText, and accept or reject them in bulk.
 */
export async function bulkAcceptBySimilar(
  batchId: string,
  entityText: string,
  action: "accept" | "reject",
): Promise<{ updatedCount: number }> {
  const user = await requireUser();
  await authorizeForBatch(user, batchId);

  const detections = await prisma.detection.findMany({
    where: {
      document: { batchId },
      status: "pending",
    },
    select: { id: true, text: true, type: true, status: true, documentId: true },
  });

  const entityLower = entityText.toLowerCase();
  const matching = detections.filter((d) => d.text.toLowerCase() === entityLower);

  if (matching.length === 0) {
    return { updatedCount: 0 };
  }

  const matchingIds = matching.map((d) => d.id);
  const newStatus = action === "accept" ? "accepted" : "rejected";

  for (const det of matching) {
    await recordHistory(det.id, "status", det.status, newStatus, user.name);
  }

  await prisma.detection.updateMany({
    where: { id: { in: matchingIds } },
    data: { status: newStatus, reviewedAt: new Date() },
  });

  const docIds = [...new Set(matching.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  const maskedEntity = maskEntityText(entityText, matching[0]?.type);
  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk ${newStatus} ${matching.length} detection(s) matching ${maskedEntity}`,
    target: "Bulk Review",
    batchId,
    detail: `Entity: ${maskedEntity}, Action: ${action}`,
  });

  return { updatedCount: matching.length };
}

// ---------------------------------------------------------------------------
// Bulk accept by detection type
// ---------------------------------------------------------------------------

/**
 * Find all pending detections in a batch matching a detection type, and
 * accept or reject them in bulk.
 */
export async function bulkAcceptByType(
  batchId: string,
  detectionType: string,
  action: "accept" | "reject",
): Promise<{ updatedCount: number }> {
  const user = await requireUser();
  await authorizeForBatch(user, batchId);

  const detections = await prisma.detection.findMany({
    where: {
      document: { batchId },
      status: "pending",
      type: detectionType,
    },
    select: { id: true, status: true, documentId: true },
  });

  if (detections.length === 0) {
    return { updatedCount: 0 };
  }

  const matchingIds = detections.map((d) => d.id);
  const newStatus = action === "accept" ? "accepted" : "rejected";

  for (const det of detections) {
    await recordHistory(det.id, "status", det.status, newStatus, user.name);
  }

  await prisma.detection.updateMany({
    where: { id: { in: matchingIds } },
    data: { status: newStatus, reviewedAt: new Date() },
  });

  const docIds = [...new Set(detections.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk ${newStatus} ${detections.length} detection(s) of type "${detectionType}"`,
    target: "Bulk Review",
    batchId,
    detail: `Type: "${detectionType}", Action: ${action}`,
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
 * Bulk-accept all pending detections on a document.
 */
export async function acceptRemainingDetections(
  documentId: string,
): Promise<{ accepted: number }> {
  const validated = acceptRemainingSchema.parse({ documentId });

  const user = await requireUser();
  await authorizeForDocument(user, validated.documentId);

  const doc = await prisma.document.findUnique({
    where: { id: validated.documentId },
    select: { name: true, batchId: true },
  });
  if (!doc) throw new Error("Document not found");

  const result = await prisma.detection.updateMany({
    where: { documentId: validated.documentId, status: "pending" },
    data: {
      status: "accepted",
      reviewedAt: new Date(),
    },
  });

  await recomputeDocumentStatus(validated.documentId);

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Bulk accepted ${result.count} remaining detection(s)`,
    target: doc.name,
    batchId: doc.batchId,
    detail: `Accepted: ${result.count}`,
  });

  return { accepted: result.count };
}
