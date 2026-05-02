/**
 * QA Simulation data layer.
 *
 * Simulates what a release will look like from the requester's perspective:
 * a preview of redacted documents, a count of schedule entries, warnings,
 * and overall stats. Used by the pre-release QA page to catch issues
 * before export.
 */

import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulationReleasedDocument {
  name: string;
  originalPages: number;
  redactedPages: number;
  redactionCount: number;
  hasFullWithholding: boolean;
}

export interface SimulationWarning {
  type: "unreviewed" | "low-confidence" | "pending-detections";
  message: string;
  documentName: string;
}

export interface SimulationResult {
  /** What the requester will see */
  releasedDocuments: SimulationReleasedDocument[];

  /** Schedule preview */
  scheduleEntries: number;

  /** Warnings */
  warnings: SimulationWarning[];

  /** Stats */
  totalPages: number;
  totalRedactions: number;
  percentageRedacted: number;
}

// ---------------------------------------------------------------------------
// Data fetcher
// ---------------------------------------------------------------------------

export async function getQASimulation(batchId: string): Promise<SimulationResult> {
  const documents = await prisma.document.findMany({
    where: { batchId },
    orderBy: { name: "asc" },
    include: {
      detections: {
        select: {
          id: true,
          status: true,
          confidence: true,
          page: true,
        },
      },
    },
  });

  const warnings: SimulationWarning[] = [];
  const releasedDocuments: SimulationReleasedDocument[] = [];
  let totalPages = 0;
  let totalRedactions = 0;

  for (const doc of documents) {
    const acceptedDetections = doc.detections.filter((d) => d.status === "accepted");
    const pendingDetections = doc.detections.filter((d) => d.status === "pending");
    const redactionCount = acceptedDetections.length;

    const redactedPageSet = new Set(acceptedDetections.map((d) => d.page));
    const redactedPages = redactedPageSet.size;

    const hasFullWithholding =
      doc.pageCount > 0 &&
      redactedPages >= doc.pageCount &&
      redactionCount >= doc.pageCount * 3;

    releasedDocuments.push({
      name: doc.name,
      originalPages: doc.pageCount,
      redactedPages,
      redactionCount,
      hasFullWithholding,
    });

    totalPages += doc.pageCount;
    totalRedactions += redactionCount;

    if (!["reviewed", "signed-off"].includes(doc.status)) {
      warnings.push({
        type: "unreviewed",
        message: `Document has not been fully reviewed (status: ${doc.status})`,
        documentName: doc.name,
      });
    }

    if (pendingDetections.length > 0) {
      warnings.push({
        type: "pending-detections",
        message: `${pendingDetections.length} detection(s) still pending review`,
        documentName: doc.name,
      });
    }

    const lowConfCount = acceptedDetections.filter((d) => d.confidence < 0.6).length;
    if (lowConfCount > 0) {
      warnings.push({
        type: "low-confidence",
        message: `${lowConfCount} accepted detection(s) have low confidence (< 60%)`,
        documentName: doc.name,
      });
    }
  }

  const scheduleEntries = documents.reduce(
    (sum, doc) => sum + doc.detections.filter((d) => d.status === "accepted").length,
    0,
  );

  const pagesWithRedactions = new Set<string>();
  for (const doc of documents) {
    for (const det of doc.detections) {
      if (det.status === "accepted") {
        pagesWithRedactions.add(`${doc.id}-${det.page}`);
      }
    }
  }
  const percentageRedacted =
    totalPages > 0
      ? Math.round((pagesWithRedactions.size / totalPages) * 100 * 10) / 10
      : 0;

  return {
    releasedDocuments,
    scheduleEntries,
    warnings,
    totalPages,
    totalRedactions,
    percentageRedacted,
  };
}
