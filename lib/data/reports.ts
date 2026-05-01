/**
 * Reports data aggregation queries.
 */

import { prisma } from "@/lib/db/prisma";
import { getGroundLabelMap } from "@/lib/lgoima-grounds";

export interface SummaryStats {
  totalCases: number;
  documentsProcessed: number;
  totalDetections: number;
  complianceRate: number; // % of cases past deadline that are complete
}

export interface GroundUsageItem {
  ground: string;
  label: string;
  count: number;
  pct: number;
}

export interface RecentExport {
  description: string;
  userName: string;
  date: string;
  detail: string | null;
}

/**
 * Summary statistics from real DB data.
 */
export async function getSummaryStats(): Promise<SummaryStats> {
  const [totalCases, documentsProcessed, totalDetections, pastDeadlineCases, completedPastDeadline] =
    await Promise.all([
      prisma.batch.count(),
      prisma.document.count({ where: { status: { not: "pending" } } }),
      prisma.detection.count(),
      prisma.batch.count({ where: { deadline: { lt: new Date() } } }),
      prisma.batch.count({
        where: {
          deadline: { lt: new Date() },
          status: { in: ["complete", "exported"] },
        },
      }),
    ]);

  const complianceRate = pastDeadlineCases > 0
    ? Math.round((completedPastDeadline / pastDeadlineCases) * 100 * 10) / 10
    : 100;

  return { totalCases, documentsProcessed, totalDetections, complianceRate };
}

/**
 * Withholding ground usage breakdown from accepted detections.
 */
export async function getGroundUsageBreakdown(): Promise<GroundUsageItem[]> {
  const detections = await prisma.detection.findMany({
    where: { status: "accepted", appliedGround: { not: null } },
    select: { appliedGround: true },
  });

  const counts = new Map<string, number>();
  for (const d of detections) {
    const ground = d.appliedGround || "Unspecified";
    counts.set(ground, (counts.get(ground) || 0) + 1);
  }

  const total = detections.length || 1;

  const groundLabels = getGroundLabelMap();

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ground, count]) => ({
      ground,
      label: groundLabels[ground] || ground,
      count,
      pct: Math.round((count / total) * 100),
    }));
}

/**
 * Recent export audit entries.
 */
export async function getRecentExports(limit = 5): Promise<RecentExport[]> {
  const entries = await prisma.auditEntry.findMany({
    where: { type: "export-generated" },
    orderBy: { timestamp: "desc" },
    take: limit,
    select: {
      description: true,
      userName: true,
      timestamp: true,
      detail: true,
    },
  });

  return entries.map((e) => ({
    description: e.description,
    userName: e.userName,
    date: e.timestamp.toLocaleDateString("en-NZ", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    detail: e.detail,
  }));
}
