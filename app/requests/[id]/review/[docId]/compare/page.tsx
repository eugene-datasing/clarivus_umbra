import { notFound } from "next/navigation";
import { getDocument } from "@/lib/data/documents";
import { getSnapshots } from "@/lib/pipeline/version-snapshot";
import { getDetectionsForDocument } from "@/lib/data/detections";
import CompareClient from "./compare-client";

export default async function ComparePage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;

  const [doc, snapshots, currentDetections] = await Promise.all([
    getDocument(docId),
    getSnapshots(docId),
    getDetectionsForDocument(docId),
  ]);

  if (!doc) notFound();

  return (
    <CompareClient
      requestId={id}
      docId={docId}
      docName={doc.name}
      snapshots={snapshots}
      currentDetections={currentDetections.map((d) => ({
        id: d.id,
        type: d.type,
        text: d.text,
        confidence: d.confidence,
        page: d.page,
        status: d.status,
        appliedGround: d.appliedGround ?? null,
        suggestedGround: d.suggestedGround ?? null,
      }))}
    />
  );
}
