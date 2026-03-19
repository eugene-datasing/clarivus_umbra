import { getCase } from "@/lib/data/cases";
import { getDocumentsForCase } from "@/lib/data/documents";
import { notFound } from "next/navigation";
import IngestClient from "./ingest-client";

export default async function IngestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [caseData, existingDocs] = await Promise.all([
    getCase(id),
    getDocumentsForCase(id),
  ]);

  if (!caseData) notFound();

  return (
    <IngestClient
      requestId={id}
      caseReference={caseData.reference}
      existingDocs={existingDocs.map((d) => ({
        id: d.id,
        name: d.name,
        fileType: d.type,
        sizeKB: d.sizeKB,
        status: d.status as "ready" | "processing" | "queued" | "error",
        detectionCount: d.detectionCount,
        pageCount: d.pageCount,
        duplicateGroup: d.duplicateGroup,
        totalProcessingMs: d.totalProcessingMs,
      }))}
    />
  );
}
