import { prisma } from "@/lib/db/prisma";

export async function getDetectionsForDocument(documentId: string) {
  const dets = await prisma.detection.findMany({
    where: { documentId },
    orderBy: [{ page: "asc" }, { posY: "asc" }],
  });

  return dets.map((d) => ({
    id: d.id,
    documentId: d.documentId,
    type: d.type,
    text: d.text,
    confidence: d.confidence,
    page: d.page,
    position: { x: d.posX, y: d.posY, w: d.posW, h: d.posH },
    suggestedGround: d.suggestedGround,
    appliedGround: d.appliedGround,
    reasoning: d.reasoning,
    piConsideration: d.piConsideration,
    status: d.status,
    aiExplanation: d.aiExplanation,
  }));
}

export async function getDetectionStats(documentId: string) {
  const [total, accepted, rejected, pending] = await Promise.all([
    prisma.detection.count({ where: { documentId } }),
    prisma.detection.count({ where: { documentId, status: "accepted" } }),
    prisma.detection.count({ where: { documentId, status: "rejected" } }),
    prisma.detection.count({ where: { documentId, status: "pending" } }),
  ]);
  return { total, accepted, rejected, pending };
}

export async function getGroupedDetectionsForCase(caseId: string) {
  const detections = await prisma.detection.findMany({
    where: { document: { caseId } },
    include: { document: { select: { name: true } } },
    orderBy: [{ type: "asc" }, { confidence: "desc" }],
  });

  return detections.map((d) => ({
    id: d.id,
    documentId: d.documentId,
    documentName: d.document.name,
    type: d.type,
    text: d.text,
    confidence: d.confidence,
    page: d.page,
    suggestedGround: d.suggestedGround,
    appliedGround: d.appliedGround,
    status: d.status,
    aiExplanation: d.aiExplanation,
  }));
}

export async function getDetectionHistory(detectionId: string) {
  const entries = await prisma.detectionHistory.findMany({
    where: { detectionId },
    orderBy: { changedAt: "desc" },
  });

  return entries.map((e) => ({
    id: e.id,
    field: e.field,
    previousValue: e.previousValue,
    newValue: e.newValue,
    changedBy: e.changedBy,
    changedAt: e.changedAt.toISOString(),
  }));
}

export async function getWithholdingItems(caseId: string) {
  const acceptedDetections = await prisma.detection.findMany({
    where: {
      document: { caseId },
      status: "accepted",
    },
    include: { document: { select: { name: true } } },
    orderBy: [{ appliedGround: "asc" }, { document: { name: "asc" } }],
  });

  return acceptedDetections.map((d) => ({
    id: d.id,
    documentName: d.document.name,
    type: d.type,
    text: d.text,
    ground: d.appliedGround || d.suggestedGround,
    reasoning: d.reasoning,
    page: d.page,
  }));
}
