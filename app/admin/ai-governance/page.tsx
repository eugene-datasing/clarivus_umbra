import { computeAccuracyMetrics } from "@/lib/data/ai-metrics";
import { computeFalseNegativeRate } from "@/lib/pipeline/feedback-examples";
import { env } from "@/lib/config/env";
import AIGovernanceClient from "./ai-governance-client";

export default async function AIGovernancePage() {
  const [metrics, fnMetrics] = await Promise.all([
    computeAccuracyMetrics(),
    computeFalseNegativeRate(),
  ]);

  const modelConfig = {
    deployment: env.AZURE_OPENAI_DEPLOYMENT || null,
    endpointConfigured: !!env.AZURE_OPENAI_ENDPOINT,
  };

  return <AIGovernanceClient metrics={metrics} fnMetrics={fnMetrics} modelConfig={modelConfig} />;
}
