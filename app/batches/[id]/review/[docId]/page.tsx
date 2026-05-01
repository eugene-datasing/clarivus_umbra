import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getDocument, getDocumentIdsForCase } from "@/lib/data/documents";
import { getDetectionsForDocument } from "@/lib/data/detections";
import { getDocumentContent, getDocumentHeader } from "@/lib/data/document-content";
import {
  DEFAULT_VIEWER_MODE,
  SETTING_KEYS,
  getSetting,
  isViewerMode,
  type ViewerMode,
} from "@/lib/data/settings";
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
  const [caseData, doc, detections, content, documentIds, header, viewerModeRaw] = await Promise.all([
    getCase(id),
    getDocument(docId),
    getDetectionsForDocument(docId),
    getDocumentContent(docId),
    getDocumentIdsForCase(id),
    getDocumentHeader(docId),
    getSetting<unknown>(SETTING_KEYS.VIEWER_MODE, DEFAULT_VIEWER_MODE),
  ]);

  // Validate the stored VIEWER_MODE; fall back to default on malformed rows
  // rather than crashing the review page.
  const viewerMode: ViewerMode = isViewerMode(viewerModeRaw) ? viewerModeRaw : DEFAULT_VIEWER_MODE;

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

  const currentDocIndex = documentIds.indexOf(docId);

  // Determine effective doc status after potential transition
  const docStatus = doc.status === "ready" ? "in-review" : doc.status;

  // PDF viewer URL — built from the canonical PDF when one exists. The
  // routing decision (HTML vs PDF branch) is made client-side in ReviewClient
  // against viewerMode + presence of canonicalPdfPath.
  const pdfUrl = doc.canonicalPdfPath ? `/api/files/${doc.canonicalPdfPath}` : undefined;

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
      canonicalPdfPath={doc.canonicalPdfPath}
      canonicalPdfTextSelectable={doc.canonicalPdfTextSelectable}
      pdfUrl={pdfUrl}
      viewerMode={viewerMode}
    />
  );
}
