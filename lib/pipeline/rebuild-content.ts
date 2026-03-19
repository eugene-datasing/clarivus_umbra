/**
 * Rebuild contentJson for a document after manual detection changes.
 *
 * Re-runs buildContent() using the stored DocumentPage rows and current
 * non-rejected detections.  No re-extraction from files is needed — everything
 * comes from the database.
 */

import { prisma } from "@/lib/db/prisma";
import { buildContent, type DetectionInput } from "./content-builder";
import type { ExtractedPage } from "./extract";

/**
 * Fetch pages + non-rejected detections from DB, rebuild the DocParagraph[]
 * structure, and update the document's contentJson.
 */
export async function rebuildContentJson(documentId: string): Promise<void> {
  // Fetch stored pages
  const pages = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: "asc" },
  });

  if (pages.length === 0) {
    return; // Nothing to rebuild
  }

  // Convert to ExtractedPage shape that buildContent expects
  const extractedPages: ExtractedPage[] = pages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
    width: p.width ?? undefined,
    height: p.height ?? undefined,
  }));

  // Fetch all non-rejected detections
  const detections = await prisma.detection.findMany({
    where: {
      documentId,
      status: { not: "rejected" },
    },
    orderBy: [{ page: "asc" }, { posY: "asc" }],
  });

  const detectionInputs: DetectionInput[] = detections.map((d) => ({
    id: d.id,
    type: d.type,
    text: d.text,
    page: d.page,
    confidence: d.confidence,
    suggestedGround: d.suggestedGround,
  }));

  // Rebuild content structure
  const content = buildContent(extractedPages, detectionInputs);

  // Update document
  await prisma.document.update({
    where: { id: documentId },
    data: {
      contentJson: JSON.parse(JSON.stringify(content)),
    },
  });
}
