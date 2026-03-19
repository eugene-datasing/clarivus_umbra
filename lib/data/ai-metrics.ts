/**
 * Compute AI accuracy metrics from reviewed detection outcomes.
 *
 * True Positive (TP): AI-detected + accepted by reviewer
 * False Positive (FP): AI-detected + rejected by reviewer
 * False Negative (FN): not detectable from review data alone (would need ground truth),
 *   but we approximate by counting pattern-detected items that AI missed.
 */

import { prisma } from "@/lib/db/prisma";

export interface EntityMetric {
  entity: string;
  tp: number;
  fp: number;
  total: number;
  precision: number;
  sampleSize: number;
}

export interface ConfidenceBand {
  label: string;
  count: number;
  percentage: number;
}

export interface AIMetrics {
  totalReviewed: number;
  aiDetections: number;
  tp: number;
  fp: number;
  precision: number;
  entityBreakdown: EntityMetric[];
  confidenceDistribution: ConfidenceBand[];
  hasSufficientData: boolean;
}

const MIN_SAMPLE_SIZE = 10;

export async function computeAccuracyMetrics(): Promise<AIMetrics> {
  // Get all reviewed AI detections
  const reviewed = await prisma.detection.findMany({
    where: {
      source: "ai",
      status: { in: ["accepted", "rejected"] },
    },
    select: {
      type: true,
      status: true,
      confidence: true,
    },
  });

  const totalReviewed = reviewed.length;
  const hasSufficientData = totalReviewed >= MIN_SAMPLE_SIZE;

  // Overall TP/FP
  const tp = reviewed.filter((d) => d.status === "accepted").length;
  const fp = reviewed.filter((d) => d.status === "rejected").length;
  const precision = totalReviewed > 0 ? tp / totalReviewed : 0;

  // Get total AI detections (including pending)
  const aiDetections = await prisma.detection.count({
    where: { source: "ai" },
  });

  // Entity breakdown
  const entityMap = new Map<string, { tp: number; fp: number; total: number }>();
  for (const det of reviewed) {
    const entry = entityMap.get(det.type) ?? { tp: 0, fp: 0, total: 0 };
    entry.total++;
    if (det.status === "accepted") entry.tp++;
    else entry.fp++;
    entityMap.set(det.type, entry);
  }

  const entityBreakdown: EntityMetric[] = Array.from(entityMap.entries())
    .map(([entity, stats]) => ({
      entity,
      tp: stats.tp,
      fp: stats.fp,
      total: stats.total,
      precision: stats.total > 0 ? stats.tp / stats.total : 0,
      sampleSize: stats.total,
    }))
    .sort((a, b) => b.sampleSize - a.sampleSize);

  // Confidence distribution (all AI detections, not just reviewed)
  const allAiDetections = await prisma.detection.findMany({
    where: { source: "ai" },
    select: { confidence: true },
  });

  let highCount = 0;
  let medCount = 0;
  let lowCount = 0;
  for (const d of allAiDetections) {
    if (d.confidence >= 85) highCount++;
    else if (d.confidence >= 50) medCount++;
    else lowCount++;
  }

  const totalConf = allAiDetections.length || 1;
  const confidenceDistribution: ConfidenceBand[] = [
    { label: "High (\u226585%)", count: highCount, percentage: Math.round((highCount / totalConf) * 100) },
    { label: "Medium (50\u201384%)", count: medCount, percentage: Math.round((medCount / totalConf) * 100) },
    { label: "Low (<50%)", count: lowCount, percentage: Math.round((lowCount / totalConf) * 100) },
  ];

  return {
    totalReviewed,
    aiDetections,
    tp,
    fp,
    precision,
    entityBreakdown,
    confidenceDistribution,
    hasSufficientData,
  };
}
