/**
 * Feedback examples — Phase 5 stripped the FeedbackExample model. The
 * AI-learning prompt-augmentation feature is shelved; this module
 * keeps a stub `buildFeedbackPromptSection` so callers compile, plus a
 * source-based false-negative rate that surveys Detection rows
 * directly (manual vs AI accepted ratio). The richer per-type
 * breakdown that depended on FeedbackExample is gone.
 */

import { prisma } from "@/lib/db/prisma";

export async function buildFeedbackPromptSection(): Promise<string> {
  return "";
}

export interface FalseNegativeMetrics {
  totalManual: number;
  totalAI: number;
  falseNegativeRate: number;
  byType: Array<{
    type: string;
    manual: number;
    ai: number;
    missRate: number;
  }>;
}

export async function computeFalseNegativeRate(): Promise<FalseNegativeMetrics> {
  const [manualCount, aiCount] = await Promise.all([
    prisma.detection.count({
      where: { source: "manual", status: "accepted" },
    }),
    prisma.detection.count({
      where: { source: "ai", status: "accepted" },
    }),
  ]);

  const total = manualCount + aiCount;
  const falseNegativeRate = total > 0 ? manualCount / total : 0;

  const manualByType = await prisma.detection.groupBy({
    by: ["type"],
    where: { source: "manual", status: "accepted" },
    _count: true,
  });

  const aiByType = await prisma.detection.groupBy({
    by: ["type"],
    where: { source: "ai", status: "accepted" },
    _count: true,
  });

  const typeMap = new Map<string, { manual: number; ai: number }>();

  for (const row of manualByType) {
    const entry = typeMap.get(row.type) ?? { manual: 0, ai: 0 };
    entry.manual = row._count;
    typeMap.set(row.type, entry);
  }

  for (const row of aiByType) {
    const entry = typeMap.get(row.type) ?? { manual: 0, ai: 0 };
    entry.ai = row._count;
    typeMap.set(row.type, entry);
  }

  const byType = Array.from(typeMap.entries())
    .map(([type, stats]) => ({
      type,
      manual: stats.manual,
      ai: stats.ai,
      missRate:
        stats.manual + stats.ai > 0
          ? stats.manual / (stats.manual + stats.ai)
          : 0,
    }))
    .sort((a, b) => b.missRate - a.missRate);

  return {
    totalManual: manualCount,
    totalAI: aiCount,
    falseNegativeRate,
    byType,
  };
}
