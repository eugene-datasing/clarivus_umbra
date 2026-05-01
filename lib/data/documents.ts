import { prisma } from "@/lib/db/prisma";

export async function getDocumentsForCase(batchId: string) {
  const docs = await prisma.document.findMany({
    where: { batchId },
    include: { assignee: true },
    orderBy: { updatedAt: "desc" },
  });

  return docs.map((d) => ({
    id: d.id,
    batchId: d.batchId,
    name: d.name,
    type: d.fileType,
    pageCount: d.pageCount,
    sizeKB: Math.round(d.sizeBytes / 1024),
    status: d.status,
    detectionCount: d.detectionCount,
    avgConfidence: d.avgConfidence,
    assignee: d.assignee?.name ?? null,
    updatedAt: d.updatedAt.toISOString(),
    duplicateGroup: d.duplicateGroup ?? undefined,
    totalProcessingMs: d.totalProcessingMs ?? undefined,
  }));
}

export async function getDocument(id: string) {
  const d = await prisma.document.findUnique({
    where: { id },
    include: { assignee: true },
  });
  if (!d) return null;

  return {
    id: d.id,
    batchId: d.batchId,
    name: d.name,
    type: d.fileType,
    pageCount: d.pageCount,
    sizeKB: Math.round(d.sizeBytes / 1024),
    status: d.status,
    detectionCount: d.detectionCount,
    avgConfidence: d.avgConfidence,
    assignee: d.assignee?.name ?? null,
    updatedAt: d.updatedAt.toISOString(),
    duplicateGroup: d.duplicateGroup ?? undefined,
    originalPath: d.originalPath ?? undefined,
    canonicalPdfPath: d.canonicalPdfPath ?? undefined,
    canonicalPdfTextSelectable: d.canonicalPdfTextSelectable ?? undefined,
  };
}

export async function getDocumentIdsForCase(batchId: string): Promise<string[]> {
  const docs = await prisma.document.findMany({
    where: { batchId },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return docs.map((d) => d.id);
}

export async function getDocumentPages(documentId: string) {
  return prisma.documentPage.findMany({
    where: { documentId },
    select: { pageNumber: true, width: true, height: true },
    orderBy: { pageNumber: "asc" },
  });
}

export async function getQueueDocuments() {
  const docs = await prisma.document.findMany({
    where: { status: { in: ["ready", "in-review", "submitted"] } },
    include: { assignee: true, batch: true },
    orderBy: { updatedAt: "desc" },
  });

  return docs.map((d) => ({
    id: d.id,
    batchId: d.batchId,
    batchReference: d.batch.reference,
    name: d.name,
    type: d.fileType,
    pageCount: d.pageCount,
    sizeKB: Math.round(d.sizeBytes / 1024),
    status: d.status,
    detectionCount: d.detectionCount,
    avgConfidence: d.avgConfidence,
    assignee: d.assignee?.name ?? null,
    updatedAt: d.updatedAt.toISOString(),
  }));
}
