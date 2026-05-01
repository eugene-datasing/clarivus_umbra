import { getBatches } from "@/lib/data/batches";
import { getQueueDocuments } from "@/lib/data/documents";
import { getProcessingMetrics } from "@/lib/data/processing-metrics";
import QueueClient from "./queue-client";
import ProcessingDashboard from "./processing-dashboard";

export default async function QueuePage() {
  const [queueDocuments, batches, metrics] = await Promise.all([
    getQueueDocuments(),
    getBatches(),
    getProcessingMetrics(),
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

      {/* Review Queue */}
      <QueueClient queueDocuments={queueDocuments} batches={batches} />
    </div>
  );
}
