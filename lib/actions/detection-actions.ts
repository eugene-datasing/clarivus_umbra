"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";

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
    userName: "K. Williams",
    userRole: "Reviewer",
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

  await createAuditEntry({
    userName: "K. Williams",
    userRole: "Reviewer",
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

  await createAuditEntry({
    userName: "A. Richardson",
    userRole: "Senior Reviewer",
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
    userName: "A. Richardson",
    userRole: "Senior Reviewer",
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
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    include: { document: { select: { name: true, caseId: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  const appliedGround = ground || detection.suggestedGround;

  // Record change history
  await recordHistory(detectionId, "status", detection.status, "accepted", "K. Williams");
  if (detection.appliedGround !== appliedGround) {
    await recordHistory(detectionId, "appliedGround", detection.appliedGround, appliedGround ?? null, "K. Williams");
  }

  await prisma.detection.update({
    where: { id: detectionId },
    data: {
      status: "accepted",
      appliedGround,
      reviewedAt: new Date(),
    },
  });

  await createAuditEntry({
    userName: "K. Williams",
    userRole: "Reviewer",
    type: "review",
    description: `Accepted detection: "${detection.text.substring(0, 40)}${detection.text.length > 40 ? "..." : ""}"`,
    target: detection.document.name,
    caseId: detection.document.caseId,
    detail: `Detection ${detectionId}, Confidence: ${detection.confidence}%, Ground: ${appliedGround}`,
  });

  await recomputeDocumentStatus(detection.documentId);

  return { success: true };
}

export async function rejectDetection(detectionId: string, reason?: string) {
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    include: { document: { select: { name: true, caseId: true } } },
  });
  if (!detection) throw new Error("Detection not found");

  await recordHistory(detectionId, "status", detection.status, "rejected", "K. Williams");
  if (detection.appliedGround) {
    await recordHistory(detectionId, "appliedGround", detection.appliedGround, null, "K. Williams");
  }

  await prisma.detection.update({
    where: { id: detectionId },
    data: {
      status: "rejected",
      appliedGround: null,
      reviewedAt: new Date(),
    },
  });

  await createAuditEntry({
    userName: "K. Williams",
    userRole: "Reviewer",
    type: "review",
    description: `Rejected detection: "${detection.text.substring(0, 40)}${detection.text.length > 40 ? "..." : ""}"`,
    target: detection.document.name,
    caseId: detection.document.caseId,
    detail: reason ? `Reason: ${reason}` : undefined,
  });

  await recomputeDocumentStatus(detection.documentId);

  return { success: true };
}

export async function revertDetection(detectionId: string) {
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: { documentId: true, status: true, appliedGround: true },
  });

  if (detection) {
    await recordHistory(detectionId, "status", detection.status, "pending", "K. Williams");
    if (detection.appliedGround) {
      await recordHistory(detectionId, "appliedGround", detection.appliedGround, null, "K. Williams");
    }
  }

  await prisma.detection.update({
    where: { id: detectionId },
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
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: { appliedGround: true },
  });

  if (detection) {
    await recordHistory(detectionId, "appliedGround", detection.appliedGround, groundId, "K. Williams");
  }

  await prisma.detection.update({
    where: { id: detectionId },
    data: { appliedGround: groundId },
  });

  return { success: true };
}

export async function bulkAcceptDetections(detectionIds: string[], ground?: string) {
  // Get the document IDs and case info for recomputation + audit
  const detections = await prisma.detection.findMany({
    where: { id: { in: detectionIds } },
    select: { documentId: true, text: true, document: { select: { caseId: true } } },
  });

  const result = await prisma.detection.updateMany({
    where: { id: { in: detectionIds } },
    data: {
      status: "accepted",
      appliedGround: ground || undefined,
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
      userName: "K. Williams",
      userRole: "Reviewer",
      type: "review",
      description: `Bulk accepted ${result.count} detection(s) for "${sampleText}${detections[0]?.text?.length > 40 ? "..." : ""}"`,
      target: "Bulk Review",
      caseId,
      detail: ground ? `Ground: ${ground}` : undefined,
    });
  }

  return { count: result.count };
}

export async function bulkRejectDetections(detectionIds: string[]) {
  const detections = await prisma.detection.findMany({
    where: { id: { in: detectionIds } },
    select: { documentId: true, text: true, document: { select: { caseId: true } } },
  });

  const result = await prisma.detection.updateMany({
    where: { id: { in: detectionIds } },
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
      userName: "K. Williams",
      userRole: "Reviewer",
      type: "review",
      description: `Bulk rejected ${result.count} detection(s) for "${sampleText}${detections[0]?.text?.length > 40 ? "..." : ""}"`,
      target: "Bulk Review",
      caseId,
    });
  }

  return { count: result.count };
}
