import { getSummaryStats, getGroundUsageBreakdown, getRecentExports } from "@/lib/data/reports";
import { computeAccuracyMetrics } from "@/lib/data/ai-metrics";
import { prisma } from "@/lib/db/prisma";
import ReportsClient from "./reports-client";

export default async function ReportsPage() {
  const [stats, groundUsage, recentExports, aiMetrics, allCases] = await Promise.all([
    getSummaryStats(),
    getGroundUsageBreakdown(),
    getRecentExports(),
    computeAccuracyMetrics(),
    prisma.case.findMany({
      orderBy: { dateReceived: "desc" },
      select: { id: true, reference: true, requesterName: true },
    }),
  ]);

  return (
    <ReportsClient
      stats={stats}
      groundUsage={groundUsage}
      recentExports={recentExports}
      aiMetrics={aiMetrics}
      cases={allCases}
    />
  );
}
