import {
  getSummaryStats,
  getDetectionTypeBreakdown,
  getRecentExports,
} from "@/lib/data/reports";
import { computeAccuracyMetrics } from "@/lib/data/ai-metrics";
import { prisma } from "@/lib/db/prisma";
import ReportsClient from "./reports-client";

export default async function ReportsPage() {
  const [stats, typeUsage, recentExports, aiMetrics, allCases] = await Promise.all([
    getSummaryStats(),
    getDetectionTypeBreakdown(),
    getRecentExports(),
    computeAccuracyMetrics(),
    prisma.batch.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, reference: true, name: true },
    }),
  ]);

  return (
    <ReportsClient
      stats={stats}
      typeUsage={typeUsage}
      recentExports={recentExports}
      aiMetrics={aiMetrics}
      cases={allCases}
    />
  );
}
