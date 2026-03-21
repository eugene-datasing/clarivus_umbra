/**
 * Cost Recovery data layer.
 *
 * Calculates processing costs for a LGOIMA request based on automated
 * processing time, human review estimates, and senior review time.
 * Used to support cost-recovery reporting under LGOIMA s13A.
 */

import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Configurable cost rates (NZD per hour)
// ---------------------------------------------------------------------------

export const COST_RATES = {
  /** Rate for automated AI processing ($/hr) */
  AUTOMATED_PROCESSING_RATE: 50,
  /** Rate for human reviewer time ($/hr) */
  HUMAN_REVIEW_RATE: 80,
  /** Rate for senior reviewer / legal time ($/hr) */
  SENIOR_REVIEW_RATE: 120,
  /** Estimated minutes per detection for human review */
  MINUTES_PER_DETECTION: 2,
  /** Senior review time as a proportion of human review time */
  SENIOR_REVIEW_RATIO: 0.2,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostRecoveryDocumentItem {
  name: string;
  pages: number;
  processingMs: number | null;
  estimatedReviewMinutes: number;
}

export interface CostRecoveryData {
  caseId: string;
  caseReference: string;
  requesterName: string;
  dateReceived: string;

  // Time costs
  automatedProcessingHours: number;
  humanReviewHours: number;
  seniorReviewHours: number;
  totalHours: number;

  // Document costs
  documentCount: number;
  pageCount: number;

  // Cost calculations (based on configurable rates)
  automatedCostNZD: number;
  reviewCostNZD: number;
  seniorReviewCostNZD: number;
  totalCostNZD: number;

  // Breakdown by document
  documents: CostRecoveryDocumentItem[];
}

// ---------------------------------------------------------------------------
// Data fetcher
// ---------------------------------------------------------------------------

export async function getCostRecoveryData(caseId: string): Promise<CostRecoveryData> {
  const caseData = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
  });

  const documents = await prisma.document.findMany({
    where: { caseId },
    orderBy: { name: "asc" },
    include: {
      detections: {
        select: { id: true },
      },
    },
  });

  // Build per-document breakdown
  const docItems: CostRecoveryDocumentItem[] = documents.map((doc) => {
    const detectionCount = doc.detections.length;
    const estimatedReviewMinutes = detectionCount * COST_RATES.MINUTES_PER_DETECTION;

    return {
      name: doc.name,
      pages: doc.pageCount,
      processingMs: doc.totalProcessingMs,
      estimatedReviewMinutes,
    };
  });

  // Aggregate processing time
  const totalProcessingMs = documents.reduce(
    (sum, doc) => sum + (doc.totalProcessingMs ?? 0),
    0,
  );
  const automatedProcessingHours = totalProcessingMs / (1000 * 60 * 60);

  // Aggregate detection count for review time estimate
  const totalDetections = documents.reduce(
    (sum, doc) => sum + doc.detections.length,
    0,
  );
  const humanReviewMinutes = totalDetections * COST_RATES.MINUTES_PER_DETECTION;
  const humanReviewHours = humanReviewMinutes / 60;

  // Senior review = percentage of human review
  const seniorReviewHours = humanReviewHours * COST_RATES.SENIOR_REVIEW_RATIO;

  const totalHours = automatedProcessingHours + humanReviewHours + seniorReviewHours;

  // Cost calculations
  const automatedCostNZD = automatedProcessingHours * COST_RATES.AUTOMATED_PROCESSING_RATE;
  const reviewCostNZD = humanReviewHours * COST_RATES.HUMAN_REVIEW_RATE;
  const seniorReviewCostNZD = seniorReviewHours * COST_RATES.SENIOR_REVIEW_RATE;
  const totalCostNZD = automatedCostNZD + reviewCostNZD + seniorReviewCostNZD;

  // Aggregate page count
  const pageCount = documents.reduce((sum, doc) => sum + doc.pageCount, 0);

  return {
    caseId,
    caseReference: caseData.reference,
    requesterName: caseData.requesterName,
    dateReceived: caseData.dateReceived.toISOString().split("T")[0],

    automatedProcessingHours: round2(automatedProcessingHours),
    humanReviewHours: round2(humanReviewHours),
    seniorReviewHours: round2(seniorReviewHours),
    totalHours: round2(totalHours),

    documentCount: documents.length,
    pageCount,

    automatedCostNZD: round2(automatedCostNZD),
    reviewCostNZD: round2(reviewCostNZD),
    seniorReviewCostNZD: round2(seniorReviewCostNZD),
    totalCostNZD: round2(totalCostNZD),

    documents: docItems,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
