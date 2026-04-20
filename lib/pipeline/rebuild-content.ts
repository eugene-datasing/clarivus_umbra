/**
 * Rebuild contentJson for a document after manual detection changes.
 *
 * Preferred path (Option E): walk the existing DocParagraph[] tree stored in
 * Document.contentJson, refreshing only the detection-span segments so that
 * structural information (table rows/cells, list items, headings, etc.) is
 * preserved across manual-detection mutations.
 *
 * Safety net: when the existing contentJson is missing, empty, or fails a
 * minimal structural sanity check, fall back to the flat rebuild from
 * DocumentPage.text via buildContent(). This preserves the pre-Option-E
 * behaviour for legacy rows with no stored contentJson or for documents
 * whose stored content is not in the expected shape.
 */

import { prisma } from "@/lib/db/prisma";
import {
  buildContent,
  buildSegmentsForText,
  type DetectionInput,
} from "./content-builder";
import type { ExtractedPage } from "./extract";
import type {
  DocParagraph,
  DocSegment,
  DocTableRow,
} from "@/lib/db/mappers";

const VALID_BLOCK_TYPES = new Set([
  "heading",
  "paragraph",
  "list",
  "image",
  "table",
]);

/**
 * Minimal structural sanity check: non-null, is an array, contains at least
 * one entry whose `type` field is a recognised DocBlockType. Kept
 * deliberately loose so legitimate documents aren't forced onto the flat
 * fallback path unnecessarily. Legacy / untyped entries inside an otherwise
 * sane array are handled case-by-case inside refreshSegments.
 */
export function isStructurallySane(value: unknown): value is DocParagraph[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((p) => {
    if (!p || typeof p !== "object") return false;
    const t = (p as DocParagraph).type;
    return typeof t === "string" && VALID_BLOCK_TYPES.has(t);
  });
}

function refreshSegmentList(
  segs: DocSegment[] | undefined,
  detections: DetectionInput[],
): DocSegment[] {
  if (!segs || segs.length === 0) return segs ?? [];
  const text = segs.map((s) => s.text).join("");
  if (!text) return segs;
  return buildSegmentsForText(text, detections);
}

/**
 * Walk an existing DocParagraph[] tree and refresh detection-span segments
 * from a fresh DetectionInput list while preserving structural fields.
 *
 * Case coverage:
 *   - type: "table"     — rows/cells preserved; each cell's segments refreshed
 *                         via buildSegmentsForText. isHeader flag preserved.
 *   - type: "list"      — listStyle preserved; items recursed into.
 *   - type: "heading"   — level preserved; top-level segments refreshed.
 *   - type: "paragraph" — top-level segments refreshed.
 *   - type: "image"     — segments left unchanged (placeholder content).
 *   - legacy / untyped  — top-level segments refreshed as if paragraph;
 *                         heading / page fields preserved.
 *   - unknown type      — pass through unchanged for safety.
 */
export function refreshSegments(
  paragraphs: DocParagraph[],
  detections: DetectionInput[],
): DocParagraph[] {
  return paragraphs.map((para) => {
    const type = para.type;

    if (type === "table") {
      const refreshedRows: DocTableRow[] = (para.rows ?? []).map((row) => ({
        cells: row.cells.map((cell) => ({
          ...cell,
          segments: refreshSegmentList(cell.segments, detections),
        })),
      }));
      return { ...para, rows: refreshedRows };
    }

    if (type === "list") {
      const refreshedItems = para.items
        ? refreshSegments(para.items, detections)
        : para.items;
      return { ...para, items: refreshedItems };
    }

    if (type === "heading" || type === "paragraph") {
      return { ...para, segments: refreshSegmentList(para.segments, detections) };
    }

    if (type === "image") {
      return { ...para };
    }

    if (!type) {
      // Legacy / untyped paragraph — treat as "paragraph" for segment refresh.
      return { ...para, segments: refreshSegmentList(para.segments, detections) };
    }

    // Unknown future type — pass through unchanged for safety.
    return { ...para };
  });
}

/**
 * Fetch pages + non-rejected detections from DB, refresh the DocParagraph[]
 * structure (or flat-rebuild on safety-net fall-through), and update the
 * document's contentJson.
 */
export async function rebuildContentJson(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { contentJson: true },
  });

  const pages = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNumber: "asc" },
  });

  if (pages.length === 0) {
    return; // Nothing to rebuild
  }

  // Build ExtractedPage[] lazily only if we need the fallback path.
  const buildExtractedPages = (): ExtractedPage[] =>
    pages.map((p) => ({
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

  const existingContent = doc?.contentJson;
  const content = isStructurallySane(existingContent)
    ? refreshSegments(existingContent, detectionInputs)
    : buildContent(buildExtractedPages(), detectionInputs);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      contentJson: JSON.parse(JSON.stringify(content)),
    },
  });
}
