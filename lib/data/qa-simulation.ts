/**
 * QA Simulation data layer.
 *
 * Simulates what a LGOIMA release will look like from the requester's
 * perspective. Produces a preview of released documents, withholding
 * schedule entries, warnings, and overall stats.
 *
 * Used by the pre-release QA page to catch issues before export.
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
  type: "unreviewed" | "no-ground" | "low-confidence" | "pending-detections";
  message: string;
  documentName: string;
}

export interface SimulationResult {
  /** What the requester will see */
  releasedDocuments: SimulationReleasedDocument[];

  /** Schedule preview */
  withholdingScheduleEntries: number;
  groundsUsed: string[];

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

export async function getQASimulation(caseId: string): Promise<SimulationResult> {
  const documents = await prisma.document.findMany({
    where: { caseId },
    orderBy: { name: "asc" },
    include: {
      detections: {
        select: {
          id: true,
          status: true,
          appliedGround: true,
          suggestedGround: true,
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
  const groundsSet = new Set<string>();

  for (const doc of documents) {
    const acceptedDetections = doc.detections.filter((d) => d.status === "accepted");
    const pendingDetections = doc.detections.filter((d) => d.status === "pending");
    const redactionCount = acceptedDetections.length;

    // Collect grounds used
    for (const det of acceptedDetections) {
      const ground = det.appliedGround || det.suggestedGround;
      if (ground) groundsSet.add(ground);
    }

    // Which pages have redactions
    const redactedPageSet = new Set(acceptedDetections.map((d) => d.page));
    const redactedPages = redactedPageSet.size;

    // Is the entire document withheld? Heuristic: every page has at least
    // one redaction AND the number of redactions exceeds a threshold per page
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

    // ------ Warnings ------

    // Unreviewed document (not in reviewed or signed-off status)
    if (!["reviewed", "signed-off"].includes(doc.status)) {
      warnings.push({
        type: "unreviewed",
        message: `Document has not been fully reviewed (status: ${doc.status})`,
        documentName: doc.name,
      });
    }

    // Pending detections
    if (pendingDetections.length > 0) {
      warnings.push({
        type: "pending-detections",
        message: `${pendingDetections.length} detection(s) still pending review`,
        documentName: doc.name,
      });
    }

    // Accepted detections without a withholding ground
    const noGroundCount = acceptedDetections.filter(
      (d) => !d.appliedGround && !d.suggestedGround,
    ).length;
    if (noGroundCount > 0) {
      warnings.push({
        type: "no-ground",
        message: `${noGroundCount} accepted detection(s) have no withholding ground assigned`,
        documentName: doc.name,
      });
    }

    // Low-confidence accepted detections (below 0.6)
    const lowConfCount = acceptedDetections.filter(
      (d) => d.confidence < 0.6,
    ).length;
    if (lowConfCount > 0) {
      warnings.push({
        type: "low-confidence",
        message: `${lowConfCount} accepted detection(s) have low confidence (< 60%)`,
        documentName: doc.name,
      });
    }
  }

  // Withholding schedule entries = accepted detections with grounds
  const withholdingScheduleEntries = documents.reduce(
    (sum, doc) =>
      sum +
      doc.detections.filter(
        (d) => d.status === "accepted" && (d.appliedGround || d.suggestedGround),
      ).length,
    0,
  );

  // Percentage of pages that have at least one redaction
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
    withholdingScheduleEntries,
    groundsUsed: Array.from(groundsSet).sort(),
    warnings,
    totalPages,
    totalRedactions,
    percentageRedacted,
  };
}
