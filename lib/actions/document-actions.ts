"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch, authorizeForDocument } from "@/lib/auth/authorize";
import { createAuditEntry } from "@/lib/data/audit";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Mark documents as excluded — removes them from the review/export workflow
 * without deleting the underlying data. Documents can be un-excluded later.
 */
export async function bulkExcludeDocuments(documentIds: string[]) {
  const user = await requireUser();
  if (documentIds.length === 0) throw new Error("No documents specified");

  // Authorize for the case of the first document (all should belong to same case)
  const firstDoc = await prisma.document.findUnique({
    where: { id: documentIds[0] },
    select: { batchId: true },
  });
  if (!firstDoc) throw new Error("Document not found");
  await authorizeForBatch(user, firstDoc.batchId);

  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, name: true, batchId: true, status: true },
  });

  const updated = await prisma.document.updateMany({
    where: { id: { in: documentIds } },
    data: { status: "excluded" },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "status",
    description: `Excluded ${updated.count} document(s) from review`,
    target: docs.map((d) => d.name).join(", "),
    batchId: firstDoc.batchId,
  });

  return { success: true, count: updated.count };
}

/**
 * Restore excluded documents back to their previous workflow state.
 */
export async function restoreExcludedDocument(documentId: string) {
  const user = await requireUser();
  await authorizeForDocument(user, documentId);

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, name: true, batchId: true, status: true },
  });
  if (!doc) throw new Error("Document not found");
  if (doc.status !== "excluded") throw new Error("Document is not excluded");

  // Restore to "ready" — reviewer can then pick it up
  await prisma.document.update({
    where: { id: documentId },
    data: { status: "ready" },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "status",
    description: `Restored excluded document: "${doc.name}"`,
    target: doc.name,
    batchId: doc.batchId,
  });

  return { success: true };
}

/**
 * Permanently delete a document and all its associated data
 * (detections, pages, snapshots, history). Also removes the original
 * file from storage.
 */
export async function deleteDocument(documentId: string) {
  const user = await requireUser();
  await authorizeForDocument(user, documentId);

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      name: true,
      batchId: true,
      originalPath: true,
      detectionCount: true,
    },
  });
  if (!doc) throw new Error("Document not found");

  // Delete all related records in a transaction
  await prisma.$transaction(async (tx) => {
    // Delete feedback examples linked to detections
    await tx.feedbackExample.deleteMany({
      where: { detection: { documentId } },
    });

    // Delete detection history
    await tx.detectionHistory.deleteMany({
      where: { detection: { documentId } },
    });

    // Delete detections
    await tx.detection.deleteMany({
      where: { documentId },
    });

    // Delete document pages
    await tx.documentPage.deleteMany({
      where: { documentId },
    });

    // Delete detection snapshots
    await tx.detectionSnapshot.deleteMany({
      where: { documentId },
    });

    // Delete the document itself
    await tx.document.delete({
      where: { id: documentId },
    });

    // Update case counts
    await tx.case.update({
      where: { id: doc.batchId },
      data: {
        documentCount: { decrement: 1 },
        redactionCount: { decrement: doc.detectionCount },
      },
    });
  });

  // Remove file from storage (best-effort, don't fail if storage errors)
  if (doc.originalPath) {
    try {
      const storage = getStorage();
      await storage.delete(doc.originalPath);
    } catch (err) {
      console.warn(`[delete-document] Failed to delete file from storage: ${doc.originalPath}`, err);
    }
  }

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "status",
    description: `Deleted document: "${doc.name}"`,
    target: doc.name,
    batchId: doc.batchId,
  });

  return { success: true };
}

/**
 * Bulk-assign documents to a reviewer by email.
 */
export async function bulkAssignReviewer(documentIds: string[], reviewerEmail: string) {
  const user = await requireUser();
  if (documentIds.length === 0) throw new Error("No documents specified");

  const firstDoc = await prisma.document.findUnique({
    where: { id: documentIds[0] },
    select: { batchId: true },
  });
  if (!firstDoc) throw new Error("Document not found");
  await authorizeForBatch(user, firstDoc.batchId);

  // Look up the reviewer
  const reviewer = await prisma.user.findUnique({
    where: { email: reviewerEmail.toLowerCase() },
    select: { id: true, name: true },
  });
  if (!reviewer) throw new Error("No user found with that email address");

  const updated = await prisma.document.updateMany({
    where: { id: { in: documentIds } },
    data: { assigneeId: reviewer.id },
  });

  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds } },
    select: { name: true },
  });

  await createAuditEntry({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    type: "review",
    description: `Assigned ${updated.count} document(s) to ${reviewer.name}`,
    target: docs.map((d) => d.name).join(", "),
    batchId: firstDoc.batchId,
  });

  return { success: true, count: updated.count };
}
