import { computeAccuracyMetrics } from "@/lib/data/ai-metrics";
import { computeFalseNegativeRate } from "@/lib/pipeline/feedback-examples";
import AIGovernanceClient from "./ai-governance-client";

export default async function AIGovernancePage() {
  const [metrics, fnMetrics] = await Promise.all([
    computeAccuracyMetrics(),
    computeFalseNegativeRate(),
  ]);

  return <AIGovernanceClient metrics={metrics} fnMetrics={fnMetrics} />;
}
