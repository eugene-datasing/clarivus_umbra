import { computeAccuracyMetrics } from "@/lib/data/ai-metrics";
import AIGovernanceClient from "./ai-governance-client";

export default async function AIGovernancePage() {
  const metrics = await computeAccuracyMetrics();

  return <AIGovernanceClient metrics={metrics} />;
}
