import { getGroupedDetectionsForCase, getThresholdPreview } from "@/lib/data/detections";
import { getCase } from "@/lib/data/cases";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import BulkReviewClient from "./bulk-review-client";
import { detectionTypeConfig, type DetectionType } from "@/lib/db/mappers";
import { getGroundLabelMap } from "@/lib/lgoima-grounds";

const groundLabels = getGroundLabelMap();

export default async function BulkReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForCase(user, id);
  const [caseData, detections, thresholdDetections] = await Promise.all([
    getCase(id),
    getGroupedDetectionsForCase(id),
    getThresholdPreview(id),
  ]);

  if (!caseData) notFound();

  // Group detections by text to create entity groups
  const groupMap = new Map<string, typeof detections>();
  for (const d of detections) {
    const key = d.text;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(d);
  }

  const entityGroups = Array.from(groupMap.entries()).map(
    ([entity, dets], idx) => {
      const first = dets[0];
      const typeCfg = detectionTypeConfig[first.type as DetectionType];
      const groundRef = first.appliedGround || first.suggestedGround || "";
      const ground = groundLabels[groundRef] || groundRef || "Unspecified";
      const uniqueDocs = new Set(dets.map((d) => d.documentId));

      // Build snippets from up to 3 unique-document detections
      const seenDocs = new Set<string>();
      const snippets = dets
        .filter((d) => {
          if (seenDocs.has(d.documentId)) return false;
          seenDocs.add(d.documentId);
          return true;
        })
        .slice(0, 3)
        .map((d) => ({
          doc: d.documentName,
          parts: [
            ...(d.aiExplanation
              ? [
                  {
                    text: `...${d.aiExplanation.substring(0, 60)} `,
                    highlight: false,
                  },
                ]
              : [{ text: "...", highlight: false }]),
            { text: d.text, highlight: true },
            { text: "...", highlight: false },
          ],
        }));

      return {
        id: idx + 1,
        entity,
        type: typeCfg?.label || first.type,
        ground,
        groundRef,
        docCount: uniqueDocs.size,
        occurrences: dets.length,
        confidence: Math.round(
          dets.reduce((sum, d) => sum + d.confidence, 0) / dets.length
        ),
        snippets,
        detectionIds: dets.map((d) => d.id),
        // Include per-detection statuses so the client can filter post-threshold
        detectionStatuses: dets.map((d) => ({
          id: d.id,
          status: d.status,
          confidence: d.confidence,
        })),
      };
    }
  );

  // Map threshold detection types to display labels
  const thresholdData = thresholdDetections.map((d) => {
    const typeCfg = detectionTypeConfig[d.type as DetectionType];
    return {
      id: d.id,
      type: d.type,
      typeLabel: typeCfg?.label || d.type,
      confidence: d.confidence,
      suggestedGround: d.suggestedGround,
      documentId: d.documentId,
    };
  });

  return (
    <BulkReviewClient
      entityGroups={entityGroups}
      caseReference={caseData.reference}
      requestId={id}
      totalDocuments={caseData.documentCount}
      thresholdData={thresholdData}
    />
  );
}
