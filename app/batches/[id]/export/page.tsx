import { getBatch } from "@/lib/data/batches";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import ExportClient, { type ExportDocument } from "./export-client";

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, id);
  const batchData = await getBatch(id);
  if (!batchData) notFound();

  // Fetch all documents for this case with their detection stats
  const documents = await prisma.document.findMany({
    where: { batchId: id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      pageCount: true,
      sizeBytes: true,
      fileType: true,
      _count: {
        select: {
          detections: true,
        },
      },
    },
  });

  // Get per-document accepted detection counts.
  const docIds = documents.map((d) => d.id);

  const acceptedByDoc = await prisma.detection.groupBy({
    by: ["documentId"],
    where: { documentId: { in: docIds }, status: "accepted" },
    _count: true,
  });

  const acceptedMap = new Map(acceptedByDoc.map((r) => [r.documentId, r._count]));

  const exportDocs: ExportDocument[] = documents
    .filter((d) => d.status !== "pending" && d.status !== "processing" && d.status !== "error")
    .map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      pageCount: d.pageCount,
      sizeKB: Math.round((d.sizeBytes ?? 0) / 1024),
      fileType: d.fileType ?? "PDF",
      detectionCount: d._count.detections,
      acceptedCount: acceptedMap.get(d.id) ?? 0,
    }));

  return (
    <ExportClient
      requestId={id}
      caseReference={batchData.reference}
      caseDescription={batchData.name}
      documents={exportDocs}
    />
  );
}
