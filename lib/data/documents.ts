import { prisma } from "@/lib/db/prisma";

export async function getDocumentsForCase(caseId: string) {
  const docs = await prisma.document.findMany({
    where: { caseId },
    include: { assignee: true },
    orderBy: { updatedAt: "desc" },
  });

  return docs.map((d) => ({
    id: d.id,
    requestId: d.caseId,
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
    requestId: d.caseId,
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
  };
}

export async function getDocumentIdsForCase(caseId: string): Promise<string[]> {
  const docs = await prisma.document.findMany({
    where: { caseId },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return docs.map((d) => d.id);
}

export async function getQueueDocuments() {
  const docs = await prisma.document.findMany({
    where: { status: { in: ["ready", "in-review", "submitted"] } },
    include: { assignee: true, case: true },
    orderBy: { updatedAt: "desc" },
  });

  return docs.map((d) => ({
    id: d.id,
    requestId: d.caseId,
    requestReference: d.case.reference,
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
