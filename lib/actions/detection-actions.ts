"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { createSnapshot } from "@/lib/pipeline/version-snapshot";
import { requireUser } from "@/lib/auth/session";
import { authorizeForDocument, authorizeForDetection } from "@/lib/auth/authorize";
import {
  acceptDetectionSchema,
  rejectDetectionSchema,
  applyGroundSchema,
  bulkDetectionSchema,
  detectionIdSchema,
  confidenceThresholdSchema,
} from "@/lib/validation/schemas";
import { authorizeForCase } from "@/lib/auth/authorize";

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
    select: { status: true, name: true, caseId: true },
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
    caseId: doc.caseId,
  });

  return { success: true };
}

/**
 * Submit a document for senior review. Transitions from "in-review" or
 * "reviewed" to "reviewed" (marking it ready for senior sign-off).
 */
export async function submitForSeniorReview(documentId: string) {
  const user = await requireUser();
  await authorizeForDocument(user, documentId);
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, name: true, caseId: true },
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
    description: `Submitted document for senior review: "${doc.name}"`,
    target: doc.name,
    caseId: doc.caseId,
  });

  return { success: true };
}

/**
 * Senior reviewer signs off a document. Transitions from "reviewed" to
 * "signed-off".
 */
export async function signOffDocument(documentId: string) {
  const user = await requireUser();
  await authorizeForDocument(user, documentId);
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, name: true, caseId: true },
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
    caseId: doc.caseId,
  });

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
    select: { status: true, name: true, caseId: true },
  });
  if (!doc) throw new Error("Document not found");

  if (doc.status !== "reviewed") {
    throw new Error(`Cannot request changes on document in "${doc.status}" status`);
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: "in-review" },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "status",
    description: `Requested changes on document: "${doc.name}"`,
    target: doc.name,
    caseId: doc.caseId,
    detail: reason || undefined,
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
    include: { document: { select: { name: true, caseId: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  const appliedGround = validGround || detection.suggestedGround;

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
    description: `Accepted detection: "${detection.text.substring(0, 40)}${detection.text.length > 40 ? "..." : ""}"`,
    target: detection.document.name,
    caseId: detection.document.caseId,
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
    include: { document: { select: { name: true, caseId: true } } },
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
    description: `Rejected detection: "${detection.text.substring(0, 40)}${detection.text.length > 40 ? "..." : ""}"`,
    target: detection.document.name,
    caseId: detection.document.caseId,
    detail: validReason ? `Reason: ${validReason}` : undefined,
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
  if (validIds.length > 0) await authorizeForDetection(user, validIds[0]);
  // Get the document IDs and case info for recomputation + audit
  const detections = await prisma.detection.findMany({
    where: { id: { in: validIds } },
    select: { documentId: true, text: true, document: { select: { caseId: true } } },
  });

  const result = await prisma.detection.updateMany({
    where: { id: { in: validIds } },
    data: {
      status: "accepted",
      appliedGround: validGround || undefined,
      reviewedAt: new Date(),
    },
  });

  // Recompute status for all affected documents
  const docIds = [...new Set(detections.map((d) => d.documentId))];
  for (const docId of docIds) {
    await recomputeDocumentStatus(docId);
  }

  // Audit entry
  const caseId = detections[0]?.document.caseId;
  if (caseId) {
    const sampleText = detections[0]?.text?.substring(0, 40) || "—";
    await createAuditEntry({
      userName: user.name,
      userRole: user.role,
      type: "review",
      description: `Bulk accepted ${result.count} detection(s) for "${sampleText}${detections[0]?.text?.length > 40 ? "..." : ""}"`,
      target: "Bulk Review",
      caseId,
      detail: validGround ? `Ground: ${validGround}` : undefined,
    });
  }

  return { count: result.count };
}

export async function bulkRejectDetections(detectionIds: string[]) {
  const { detectionIds: validIds } = bulkDetectionSchema.parse({ detectionIds });
  const user = await requireUser();
  if (validIds.length > 0) await authorizeForDetection(user, validIds[0]);
  const detections = await prisma.detection.findMany({
    where: { id: { in: validIds } },
    select: { documentId: true, text: true, document: { select: { caseId: true } } },
  });

  const result = await prisma.detection.updateMany({
    where: { id: { in: validIds } },
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

  // Audit entry
  const caseId = detections[0]?.document.caseId;
  if (caseId) {
    const sampleText = detections[0]?.text?.substring(0, 40) || "—";
    await createAuditEntry({
      userName: user.name,
      userRole: user.role,
      type: "review",
      description: `Bulk rejected ${result.count} detection(s) for "${sampleText}${detections[0]?.text?.length > 40 ? "..." : ""}"`,
      target: "Bulk Review",
      caseId,
    });
  }

  return { count: result.count };
}

// ---------------------------------------------------------------------------
// Confidence-threshold mass redaction
// ---------------------------------------------------------------------------

/**
 * Auto-accept all pending detections above a confidence threshold.
 * Each detection gets its suggestedGround applied as appliedGround.
 * Only senior-reviewer, admin, and request-manager roles may use this.
 */
export async function applyConfidenceThreshold(caseId: string, threshold: number) {
  const { caseId: validCaseId, threshold: validThreshold } =
    confidenceThresholdSchema.parse({ caseId, threshold });

  const user = await requireUser();
  await authorizeForCase(user, validCaseId);

  // Role restriction: only senior reviewers and admins
  const allowedRoles = new Set(["admin", "request-manager", "senior-reviewer"]);
  if (!allowedRoles.has(user.role)) {
    throw new Error("Access denied: only senior reviewers and admins can apply confidence thresholds");
  }

  // Find all pending detections above the threshold
  const detections = await prisma.detection.findMany({
    where: {
      document: { caseId: validCaseId },
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
        appliedGround: ground,
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
    caseId: validCaseId,
    detail: `Threshold: >${validThreshold}%, Documents affected: ${docIds.length}`,
  });

  return { accepted: detections.length, documentsAffected: docIds.length };
}
