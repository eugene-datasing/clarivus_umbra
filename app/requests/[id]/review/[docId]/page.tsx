import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getDocument, getDocumentIdsForCase, getDocumentPages } from "@/lib/data/documents";
import { getDetectionsForDocument } from "@/lib/data/detections";
import { getDocumentContent, documentHeaders } from "@/lib/data/document-content";
import { markDocumentInReview } from "@/lib/actions/detection-actions";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import ReviewClient from "./review-client";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const user = await requireUser();
  await authorizeForCase(user, id);

  // Fetch all data in parallel
  const [caseData, doc, detections, content, documentIds, pages] = await Promise.all([
    getCase(id),
    getDocument(docId),
    getDetectionsForDocument(docId),
    getDocumentContent(docId),
    getDocumentIdsForCase(id),
    getDocumentPages(docId),
  ]);

  if (!caseData || !doc) {
    notFound();
  }

  // Transition document from "ready" → "in-review" on first open
  // Wrapped in try/catch: the status transition is a side-effect and
  // should not prevent the page from rendering if auth fails (e.g.
  // user's department is not assigned to this case but they have a
  // direct document link).
  try {
    await markDocumentInReview(docId);
  } catch {
    // Silently skip — page still renders for read access
  }

  const header = documentHeaders[docId] ?? {
    title: "New Plymouth District Council",
    subtitle: "Te Kaunihera-a-Rohe o Ngamotu",
    date: "",
  };

  const currentDocIndex = documentIds.indexOf(docId);

  // Determine effective doc status after potential transition
  const docStatus = doc.status === "ready" ? "in-review" : doc.status;

  // PDF viewer: check if this is a PDF with actual page data
  const isPdf = doc.type === "pdf" && pages.length > 0 && !!doc.originalPath;
  const pdfUrl = doc.originalPath ? `/api/files/${doc.originalPath}` : undefined;

  return (
    <ReviewClient
      requestId={id}
      caseId={id}
      docId={docId}
      docName={doc.name}
      docStatus={docStatus}
      documentContent={content ?? []}
      header={header}
      detections={detections}
      documentIds={documentIds}
      currentDocIndex={currentDocIndex === -1 ? 0 : currentDocIndex}
      isPdf={isPdf}
      pdfUrl={pdfUrl}
    />
  );
}
