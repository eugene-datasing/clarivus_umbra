import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getDocumentsForCase } from "@/lib/data/documents";
import { getWithholdingItems } from "@/lib/data/detections";
import QAClient from "./qa-client";

export default async function QAPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [caseData, documents, withholdingItems] = await Promise.all([
    getCase(id),
    getDocumentsForCase(id),
    getWithholdingItems(id),
  ]);

  if (!caseData) {
    notFound();
  }

  return (
    <QAClient
      requestId={id}
      caseData={caseData}
      documents={documents.map((d) => ({
        id: d.id,
        status: d.status,
        detectionCount: d.detectionCount,
      }))}
      withholdingItems={withholdingItems}
    />
  );
}
