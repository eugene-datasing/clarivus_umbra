import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getDocument, getDocumentIdsForCase } from "@/lib/data/documents";
import { getDetectionsForDocument } from "@/lib/data/detections";
import { getDocumentContent, documentHeaders } from "@/lib/data/document-content";
import ReviewClient from "./review-client";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;

  // Fetch all data in parallel
  const [caseData, doc, detections, content, documentIds] = await Promise.all([
    getCase(id),
    getDocument(docId),
    getDetectionsForDocument(docId),
    getDocumentContent(docId),
    getDocumentIdsForCase(id),
  ]);

  if (!caseData || !doc) {
    notFound();
  }

  const header = documentHeaders[docId] ?? {
    title: "New Plymouth District Council",
    subtitle: "Te Kaunihera-a-Rohe o Ngamotu",
    date: "",
  };

  const currentDocIndex = documentIds.indexOf(docId);

  return (
    <ReviewClient
      requestId={id}
      docId={docId}
      docName={doc.name}
      documentContent={content ?? []}
      header={header}
      detections={detections}
      documentIds={documentIds}
      currentDocIndex={currentDocIndex === -1 ? 0 : currentDocIndex}
    />
  );
}
