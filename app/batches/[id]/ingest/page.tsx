import { getCase } from "@/lib/data/cases";
import { getDocumentsForCase } from "@/lib/data/documents";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import { isM365Configured } from "@/lib/integrations/m365-connector";
import IngestClient from "./ingest-client";

export default async function IngestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForCase(user, id);
  const [caseData, existingDocs] = await Promise.all([
    getCase(id),
    getDocumentsForCase(id),
  ]);

  if (!caseData) notFound();

  const m365Configured = isM365Configured();

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
      m365Configured={m365Configured}
    />
  );
}
