import { prisma } from "@/lib/db/prisma";

export interface ProcessingMetrics {
  totalDocuments: number;
  totalProcessed: number;
  totalFailed: number;
  totalPending: number;
  avgExtractionMs: number;
  avgPatternMs: number;
  avgAiMs: number;
  avgTotalMs: number;
  throughputPagesPerHour: number;
  recentDocuments: Array<{
    id: string;
    name: string;
    caseReference: string;
    status: string;
    pageCount: number;
    extractionMs: number | null;
    patternDetectionMs: number | null;
    aiDetectionMs: number | null;
    totalProcessingMs: number | null;
    processingCompletedAt: Date | null;
  }>;
}

export async function getProcessingMetrics(): Promise<ProcessingMetrics> {
  const [
    totalDocuments,
    totalProcessed,
    totalFailed,
    totalPending,
    avgTiming,
    recentDocs,
    throughputData,
  ] = await Promise.all([
    // Total documents across all cases
    prisma.document.count(),

    // Total processed (status = "ready", "in-review", "submitted", "approved", "released")
    prisma.document.count({
      where: { status: { in: ["ready", "in-review", "submitted", "approved", "released"] } },
    }),

    // Total failed
    prisma.document.count({ where: { status: "error" } }),

    // Total pending (queued + processing + pending)
    prisma.document.count({
      where: { status: { in: ["pending", "queued", "processing"] } },
    }),

    // Aggregate timing averages across all processed documents
    prisma.document.aggregate({
      where: {
        totalProcessingMs: { not: null },
      },
      _avg: {
        extractionMs: true,
        patternDetectionMs: true,
        aiDetectionMs: true,
        totalProcessingMs: true,
      },
    }),

    // Recent 20 processed documents with case reference
    prisma.document.findMany({
      where: {
        processingCompletedAt: { not: null },
      },
      include: {
        case: { select: { reference: true } },
      },
      orderBy: { processingCompletedAt: "desc" },
      take: 20,
    }),

    // Throughput: pages processed in the last 24 hours
    prisma.document.aggregate({
      where: {
        processingCompletedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        totalProcessingMs: { not: null },
      },
      _sum: { pageCount: true },
      _count: true,
    }),
  ]);

  // Calculate pages/hour throughput over last 24h
  const totalPagesLast24h = throughputData._sum.pageCount || 0;
  // If we have processed documents in the last 24h, calculate rate per hour
  const throughputPagesPerHour = totalPagesLast24h > 0
    ? Math.round(totalPagesLast24h / 24)
    : 0;

  return {
    totalDocuments,
    totalProcessed,
    totalFailed,
    totalPending,
    avgExtractionMs: Math.round(avgTiming._avg.extractionMs ?? 0),
    avgPatternMs: Math.round(avgTiming._avg.patternDetectionMs ?? 0),
    avgAiMs: Math.round(avgTiming._avg.aiDetectionMs ?? 0),
    avgTotalMs: Math.round(avgTiming._avg.totalProcessingMs ?? 0),
    throughputPagesPerHour,
    recentDocuments: recentDocs.map((d) => ({
      id: d.id,
      name: d.name,
      caseReference: d.case.reference,
      status: d.status,
      pageCount: d.pageCount,
      extractionMs: d.extractionMs,
      patternDetectionMs: d.patternDetectionMs,
      aiDetectionMs: d.aiDetectionMs,
      totalProcessingMs: d.totalProcessingMs,
      processingCompletedAt: d.processingCompletedAt,
    })),
  };
}

export interface CaseProcessingMetrics {
  documents: Array<{
    id: string;
    name: string;
    fileType: string;
    status: string;
    pageCount: number;
    extractionMs: number | null;
    patternDetectionMs: number | null;
    aiDetectionMs: number | null;
    totalProcessingMs: number | null;
    processingStartedAt: Date | null;
    processingCompletedAt: Date | null;
  }>;
  totalPages: number;
  avgTotalMs: number;
  totalProcessingMs: number;
}

export async function getCaseProcessingMetrics(
  batchId: string,
): Promise<CaseProcessingMetrics> {
  const docs = await prisma.document.findMany({
    where: { batchId },
    select: {
      id: true,
      name: true,
      fileType: true,
      status: true,
      pageCount: true,
      extractionMs: true,
      patternDetectionMs: true,
      aiDetectionMs: true,
      totalProcessingMs: true,
      processingStartedAt: true,
      processingCompletedAt: true,
    },
    orderBy: { name: "asc" },
  });

  const processedDocs = docs.filter((d) => d.totalProcessingMs != null);
  const totalPages = docs.reduce((sum, d) => sum + d.pageCount, 0);
  const totalProcessingMs = processedDocs.reduce(
    (sum, d) => sum + (d.totalProcessingMs ?? 0),
    0,
  );
  const avgTotalMs =
    processedDocs.length > 0
      ? Math.round(totalProcessingMs / processedDocs.length)
      : 0;

  return {
    documents: docs.map((d) => ({
      id: d.id,
      name: d.name,
      fileType: d.fileType,
      status: d.status,
      pageCount: d.pageCount,
      extractionMs: d.extractionMs,
      patternDetectionMs: d.patternDetectionMs,
      aiDetectionMs: d.aiDetectionMs,
      totalProcessingMs: d.totalProcessingMs,
      processingStartedAt: d.processingStartedAt,
      processingCompletedAt: d.processingCompletedAt,
    })),
    totalPages,
    avgTotalMs,
    totalProcessingMs,
  };
}
