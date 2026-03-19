/**
 * Feedback examples — storage helpers and AI prompt enhancement.
 *
 * When a reviewer manually adds a detection, it's recorded as a FeedbackExample
 * so the AI can learn from misses.  Recent examples are injected into the
 * GPT-4o system prompt to improve future detection accuracy.
 */

import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get the most recent feedback examples for prompt injection.
 * Capped at 20 to stay within prompt size limits (~3KB).
 */
export async function getRecentFeedbackExamples(limit = 20) {
  return prisma.feedbackExample.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Build a prompt section from recent feedback examples that can be appended
 * to the AI detection system prompt.
 *
 * Returns an empty string if there are no examples yet.
 */
export async function buildFeedbackPromptSection(): Promise<string> {
  const examples = await getRecentFeedbackExamples();

  if (examples.length === 0) {
    return "";
  }

  const lines = examples.map(
    (ex) =>
      `- Type: ${ex.type}, Text: "${ex.text}"${ex.ground ? `, Ground: ${ex.ground}` : ""}${ex.reasoning ? `, Reason: ${ex.reasoning}` : ""}`,
  );

  return `

IMPORTANT — LEARNING FROM REVIEWER FEEDBACK:
The following text items were MISSED by AI detection in previous documents but were identified by human reviewers as requiring redaction. Use these examples to improve your detection accuracy and avoid similar misses:

${lines.join("\n")}

Pay special attention to similar patterns, names, and information types in the current document.`;
}

// ---------------------------------------------------------------------------
// False negative metrics
// ---------------------------------------------------------------------------

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

/**
 * Compute false negative metrics by comparing manual vs AI detections.
 * False negative rate = manual / (ai + manual) — the proportion of accepted
 * detections that the AI missed and humans had to add manually.
 */
export async function computeFalseNegativeRate(): Promise<FalseNegativeMetrics> {
  // Count accepted detections by source
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

  // Per-type breakdown
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

  // Merge into a single map
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
