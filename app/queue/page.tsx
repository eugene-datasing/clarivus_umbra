import { getCases } from "@/lib/data/cases";
import { getQueueDocuments } from "@/lib/data/documents";
import { getProcessingMetrics } from "@/lib/data/processing-metrics";
import { getLGOIMAConfig } from "@/lib/data/org-config";
import QueueClient from "./queue-client";
import ProcessingDashboard from "./processing-dashboard";

export default async function QueuePage() {
  const [queueDocuments, cases, metrics, lgoimaConfig] = await Promise.all([
    getQueueDocuments(),
    getCases(),
    getProcessingMetrics(),
    getLGOIMAConfig(),
  ]);

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Processing Dashboard */}
      <ProcessingDashboard
        totalDocuments={metrics.totalDocuments}
        totalProcessed={metrics.totalProcessed}
        totalFailed={metrics.totalFailed}
        totalPending={metrics.totalPending}
        avgExtractionMs={metrics.avgExtractionMs}
        avgPatternMs={metrics.avgPatternMs}
        avgAiMs={metrics.avgAiMs}
        avgTotalMs={metrics.avgTotalMs}
        throughputPagesPerHour={metrics.throughputPagesPerHour}
        recentDocuments={metrics.recentDocuments.map((d) => ({
          ...d,
          processingCompletedAt: d.processingCompletedAt
            ? d.processingCompletedAt.toISOString()
            : null,
        }))}
      />

      {/* Existing Review Queue */}
      <QueueClient
        queueDocuments={queueDocuments}
        cases={cases}
        amberWarningDays={lgoimaConfig.amberWarningDays}
        redWarningDays={lgoimaConfig.redWarningDays}
      />
    </div>
  );
}
