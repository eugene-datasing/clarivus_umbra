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
    reasoning: d.reasoning,
    note: d.note,
    status: d.status,
    aiExplanation: d.aiExplanation,
    source: d.source,
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

export async function getGroupedDetectionsForCase(batchId: string) {
  const detections = await prisma.detection.findMany({
    where: { document: { batchId } },
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

/**
 * Return all pending detections for a case with the fields needed
 * for client-side confidence-threshold filtering.  The client uses
 * this to drive an interactive slider without server round-trips.
 */
export async function getThresholdPreview(batchId: string) {
  const detections = await prisma.detection.findMany({
    where: {
      document: { batchId },
      status: "pending",
    },
    select: {
      id: true,
      type: true,
      confidence: true,
      documentId: true,
    },
    orderBy: { confidence: "desc" },
  });

  return detections;
}

export async function getWithholdingItems(batchId: string) {
  const acceptedDetections = await prisma.detection.findMany({
    where: {
      document: { batchId },
      status: "accepted",
    },
    include: { document: { select: { name: true } } },
    orderBy: [{ type: "asc" }, { document: { name: "asc" } }],
  });

  return acceptedDetections.map((d) => ({
    id: d.id,
    documentName: d.document.name,
    type: d.type,
    text: d.text,
    reasoning: d.reasoning,
    note: d.note,
    page: d.page,
  }));
}
