import { getCase } from "@/lib/data/cases";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import ExportClient from "./export-client";

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseData = await getCase(id);
  if (!caseData) notFound();

  // Aggregate stats for the export summary
  const [docCount, pageSum, acceptedCount, sizeSum] = await Promise.all([
    prisma.document.count({
      where: { caseId: id, status: { in: ["ready", "in-review", "submitted", "complete"] } },
    }),
    prisma.document.aggregate({
      where: { caseId: id },
      _sum: { pageCount: true },
    }),
    prisma.detection.count({
      where: { document: { caseId: id }, status: "accepted" },
    }),
    prisma.document.aggregate({
      where: { caseId: id },
      _sum: { sizeBytes: true },
    }),
  ]);

  const totalPages = pageSum._sum.pageCount ?? 0;
  const totalSizeKB = Math.round((sizeSum._sum.sizeBytes ?? 0) / 1024);

  return (
    <ExportClient
      requestId={id}
      caseReference={caseData.reference}
      caseDescription={caseData.description}
      documentCount={docCount}
      totalPages={totalPages}
      acceptedDetections={acceptedCount}
      estimatedSizeKB={totalSizeKB}
    />
  );
}
