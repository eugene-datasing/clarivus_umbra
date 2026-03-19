import { getSummaryStats, getGroundUsageBreakdown, getRecentExports } from "@/lib/data/reports";
import { computeAccuracyMetrics } from "@/lib/data/ai-metrics";
import ReportsClient from "./reports-client";

export default async function ReportsPage() {
  const [stats, groundUsage, recentExports, aiMetrics] = await Promise.all([
    getSummaryStats(),
    getGroundUsageBreakdown(),
    getRecentExports(),
    computeAccuracyMetrics(),
  ]);

  return (
    <ReportsClient
      stats={stats}
      groundUsage={groundUsage}
      recentExports={recentExports}
      aiMetrics={aiMetrics}
    />
  );
}
