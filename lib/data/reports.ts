/**
 * Reports data aggregation queries.
 */

import { prisma } from "@/lib/db/prisma";

export interface SummaryStats {
  totalBatches: number;
  documentsProcessed: number;
  totalDetections: number;
}

export interface DetectionTypeUsageItem {
  type: string;
  count: number;
  pct: number;
}

export interface RecentExport {
  description: string;
  userName: string;
  date: string;
  detail: string | null;
}

export async function getSummaryStats(): Promise<SummaryStats> {
  const [totalBatches, documentsProcessed, totalDetections] = await Promise.all([
    prisma.batch.count(),
    prisma.document.count({ where: { status: { not: "pending" } } }),
    prisma.detection.count(),
  ]);

  return { totalBatches, documentsProcessed, totalDetections };
}

/**
 * Detection-type breakdown across accepted detections — replaces the
 * Veil-era LGOIMA ground-usage breakdown post-Phase-5 (grounds dropped from
 * Detection).
 */
export async function getDetectionTypeBreakdown(): Promise<DetectionTypeUsageItem[]> {
  const grouped = await prisma.detection.groupBy({
    by: ["type"],
    where: { status: "accepted" },
    _count: true,
  });

  const total = grouped.reduce((sum, row) => sum + row._count, 0) || 1;

  return grouped
    .sort((a, b) => b._count - a._count)
    .slice(0, 8)
    .map((row) => ({
      type: row.type,
      count: row._count,
      pct: Math.round((row._count / total) * 100),
    }));
}

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
