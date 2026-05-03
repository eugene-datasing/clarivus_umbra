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

/**
 * Phase 12.3 — Tray clusters.
 *
 * Group all `pending` detections in a batch by `(type, normalisedText)`
 * so the Tray UI can present "Sarah Mitchell — 8 occurrences in 3 docs"
 * cluster rows. Reviewer approves / rejects whole clusters via
 * `bulkAcceptBySimilar` (already takes case-insensitive matching).
 *
 * Implementation note: we group in memory rather than via raw SQL.
 * Prisma's groupBy doesn't support `array_agg` of related-row fields,
 * and a raw SQL path would have to thread Document.name back manually
 * anyway. Pending-detection counts per batch typically sit in the
 * 10s-to-hundreds, well within in-memory budget; if that ever flips
 * we can swap to a `prisma.$queryRaw` GROUP BY without changing the
 * caller shape.
 */
export interface TrayClusterOccurrence {
  detectionId: string;
  documentId: string;
  documentName: string;
  page: number;
  confidence: number;
  aiExplanation: string;
}

export interface TrayCluster {
  /** Detection type (e.g. "personal-name", "sensitive-context"). */
  type: string;
  /** Canonical text — taken from the first occurrence in the cluster. */
  text: string;
  /** Lowercased + whitespace-normalised text used as the cluster key. */
  normalisedText: string;
  /** Number of pending detections in the cluster. */
  occurrences: number;
  /** Number of distinct documents the cluster spans. */
  documentCount: number;
  /** Mean confidence across the cluster. */
  averageConfidence: number;
  /** Per-occurrence detail for the expand-row UI. */
  occurrenceList: TrayClusterOccurrence[];
}

export async function getBatchTrayClusters(
  batchId: string,
): Promise<TrayCluster[]> {
  const detections = await prisma.detection.findMany({
    where: { document: { batchId }, status: "pending" },
    include: { document: { select: { name: true } } },
    orderBy: [{ confidence: "desc" }],
  });

  const clusterMap = new Map<string, TrayCluster>();
  for (const d of detections) {
    const normalisedText = d.text.toLowerCase().replace(/\s+/g, " ").trim();
    const key = `${d.type}::${normalisedText}`;

    let cluster = clusterMap.get(key);
    if (!cluster) {
      cluster = {
        type: d.type,
        text: d.text,
        normalisedText,
        occurrences: 0,
        documentCount: 0,
        averageConfidence: 0,
        occurrenceList: [],
      };
      clusterMap.set(key, cluster);
    }
    cluster.occurrenceList.push({
      detectionId: d.id,
      documentId: d.documentId,
      documentName: d.document.name,
      page: d.page,
      confidence: d.confidence,
      aiExplanation: d.aiExplanation,
    });
  }

  // Finalise per-cluster aggregates.
  const out: TrayCluster[] = [];
  for (const cluster of clusterMap.values()) {
    cluster.occurrences = cluster.occurrenceList.length;
    cluster.documentCount = new Set(
      cluster.occurrenceList.map((o) => o.documentId),
    ).size;
    cluster.averageConfidence = Math.round(
      cluster.occurrenceList.reduce((s, o) => s + o.confidence, 0) /
        cluster.occurrenceList.length,
    );
    // Stable per-cluster ordering of occurrences: by document then page.
    cluster.occurrenceList.sort(
      (a, b) =>
        a.documentName.localeCompare(b.documentName) || a.page - b.page,
    );
    out.push(cluster);
  }

  // Default sort: most-occurrences-first, then alphabetically by type.
  out.sort(
    (a, b) =>
      b.occurrences - a.occurrences || a.type.localeCompare(b.type) ||
      a.normalisedText.localeCompare(b.normalisedText),
  );
  return out;
}

/**
 * Phase 12.3 — latest ExportJob for a batch.
 *
 * Returns the most-recent ExportJob row for the batch (irrespective of
 * status — manual or auto-export, generating or complete or error).
 * The export-client UI uses this to surface "auto-export running",
 * "auto-export complete with download link", or "auto-export failed
 * with retry button" without forking the existing polling logic.
 *
 * Returns `null` when the batch has no ExportJob rows yet.
 */
export interface LatestExportSummary {
  id: string;
  status: string;
  progress: number;
  currentStep: string | null;
  error: string | null;
  filename: string | null;
  sha256: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function getLatestExportForBatch(
  batchId: string,
): Promise<LatestExportSummary | null> {
  const job = await prisma.exportJob.findFirst({
    where: { batchId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      progress: true,
      currentStep: true,
      error: true,
      filename: true,
      sha256: true,
      createdAt: true,
      completedAt: true,
    },
  });
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    error: job.error,
    filename: job.filename,
    sha256: job.sha256,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
  };
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
