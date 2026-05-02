/**
 * Content builder for the Veil review UI.
 *
 * Takes extracted pages and their associated detections and produces a
 * DocParagraph[] structure that the review page can render.  Each paragraph
 * is split into segments -- normal text and detection-tagged spans -- so the
 * frontend can highlight and annotate detected entities inline.
 */

import type { DocParagraph, DocSegment, DocTableRow, DocTableCell } from "@/lib/db/mappers";
import type { ContentBlock } from "./format-converter";
import type { ExtractedPage } from "./extract";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "content-builder" });

// ---------------------------------------------------------------------------
// Types for the detection input
// ---------------------------------------------------------------------------

export interface DetectionInput {
  id: string;
  type: string;
  text: string;
  page: number;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Guess a paragraph type from its content.  This is a simple heuristic based
 * on common document formatting patterns.
 */
function guessParagraphHeading(text: string): string | undefined {
  const trimmed = text.trim();

  // Short all-caps or numbered heading patterns
  if (/^\d+\.\s+[A-Z]/.test(trimmed) && trimmed.length < 120) {
    return trimmed;
  }
  if (
    /^[A-Z][A-Z\s\-:]{4,}$/.test(trimmed.split("\n")[0]) &&
    trimmed.split("\n")[0].length < 80
  ) {
    return trimmed.split("\n")[0].trim();
  }

  return undefined;
}

/**
 * Given a paragraph of text and a set of detections relevant to that page,
 * produce an array of DocSegments with normal text between detection spans.
 *
 * Detection matches are found by locating the detection text within the
 * paragraph.  When multiple detections match the same region, the first one
 * wins.
 */
export function buildSegmentsForText(
  text: string,
  detections: DetectionInput[],
): DocSegment[] {
  if (!text || detections.length === 0) {
    return [{ text }];
  }

  // Find all detection occurrences in this text
  interface Marker {
    start: number;
    end: number;
    detectionId: string;
  }

  const markers: Marker[] = [];

  // Normalize whitespace (non-breaking spaces, etc.) for matching purposes.
  // Both the paragraph text and detection text are normalized for comparison,
  // but we use the original text positions for slicing so the output preserves
  // the source content exactly.
  const normalizeWs = (s: string) => s.replace(/[\u00A0\u2007\u202F\u2060]/g, " ");
  const normText = normalizeWs(text).toLowerCase();

  for (const det of detections) {
    if (!det.text) continue;

    // Try exact match first, then case-insensitive, then whitespace-normalised
    let idx = text.indexOf(det.text);
    let matchLen = det.text.length;
    if (idx === -1) {
      idx = text.toLowerCase().indexOf(det.text.toLowerCase());
    }
    if (idx === -1) {
      const normDet = normalizeWs(det.text).toLowerCase();
      idx = normText.indexOf(normDet);
      matchLen = normDet.length; // Use normalized length when matched via normalization
    }

    if (idx !== -1) {
      markers.push({
        start: idx,
        end: idx + matchLen,
        detectionId: det.id,
      });
    }
  }

  if (markers.length === 0) {
    return [{ text }];
  }

  // Sort markers by start position
  markers.sort((a, b) => a.start - b.start);

  // Remove overlapping markers (keep the first one)
  const cleaned: Marker[] = [];
  let lastEnd = -1;

  for (const m of markers) {
    if (m.start >= lastEnd) {
      cleaned.push(m);
      lastEnd = m.end;
    }
  }

  // Build segments
  const segments: DocSegment[] = [];
  let cursor = 0;

  for (const m of cleaned) {
    // Add normal text before this marker
    if (m.start > cursor) {
      segments.push({ text: text.slice(cursor, m.start) });
    }

    // Add the detection segment
    segments.push({
      text: text.slice(m.start, m.end),
      detectionId: m.detectionId,
    });

    cursor = m.end;
  }

  // Add any remaining text after the last marker
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Build a DocParagraph[] structure for the review UI.
 *
 * @param pages - Extracted text pages
 * @param detections - All detections (pattern + AI) with their DB IDs
 * @returns An array of DocParagraph objects ready to be stored as contentJson
 */
export function buildContent(
  pages: ExtractedPage[],
  detections: DetectionInput[],
): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];

  // Group detections by page number for efficient lookup
  const detectionsByPage = new Map<number, DetectionInput[]>();
  for (const det of detections) {
    const existing = detectionsByPage.get(det.page) ?? [];
    existing.push(det);
    detectionsByPage.set(det.page, existing);
  }

  for (const page of pages) {
    const pageDetections = detectionsByPage.get(page.pageNumber) ?? [];

    // Split page text into paragraphs (by double-newline, or fall back to
    // single-newline for very short documents)
    const rawParagraphs = page.text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // If splitting by double-newline yields only one chunk, try single-newline
    // but only for longer texts (avoids over-splitting short content)
    const chunks =
      rawParagraphs.length <= 1 && page.text.length > 500
        ? page.text
            .split(/\n/)
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
        : rawParagraphs;

    for (const chunk of chunks) {
      const heading = guessParagraphHeading(chunk);

      // The body text is either the part after the heading line, or the
      // whole chunk if no heading was detected
      let bodyText: string;
      if (heading && chunk.startsWith(heading)) {
        bodyText = chunk.slice(heading.length).trim();
      } else {
        bodyText = chunk;
      }

      // Build segments with detection highlights
      const segments = buildSegmentsForText(
        bodyText || chunk,
        pageDetections,
      );

      const para: DocParagraph = { segments, page: page.pageNumber };
      if (heading) {
        para.heading = heading;
      }

      paragraphs.push(para);
    }
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Structured content builder (DOCX with ContentBlocks)
// ---------------------------------------------------------------------------

/**
 * Build a DocParagraph[] structure from typed ContentBlocks.
 *
 * Used for DOCX files where mammoth produces HTML that is parsed into
 * structured ContentBlocks (heading, paragraph, list, table, image-placeholder).
 * Preserves document structure so the review UI can render headings, lists, etc.
 *
 * @param blocks - Structured content blocks from htmlToContentBlocks()
 * @param detections - All detections with their DB IDs
 * @param pageNumber - Page number to assign (DOCX = 1 since mammoth has no page breaks)
 * @returns An array of DocParagraph objects with type information
 */
export function buildContentFromBlocks(
  blocks: ContentBlock[],
  detections: DetectionInput[],
  pageNumber: number = 1,
): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const segments = buildSegmentsForText(block.content, detections);
        paragraphs.push({
          type: "heading",
          level: block.level ?? 2,
          page: pageNumber,
          segments,
        });
        break;
      }

      case "paragraph": {
        const segments = buildSegmentsForText(block.content, detections);
        paragraphs.push({
          type: "paragraph",
          page: pageNumber,
          segments,
        });
        break;
      }

      case "list": {
        // List content is newline-separated items from htmlToContentBlocks()
        const itemTexts = block.content.split("\n").filter((t) => t.trim());
        const items: DocParagraph[] = itemTexts.map((itemText) => ({
          type: "paragraph" as const,
          page: pageNumber,
          segments: buildSegmentsForText(itemText, detections),
        }));

        paragraphs.push({
          type: "list",
          listStyle: "bullet",
          page: pageNumber,
          segments: [], // List itself has no direct segments — items do
          items,
        });
        break;
      }

      case "image-placeholder": {
        paragraphs.push({
          type: "image",
          page: pageNumber,
          segments: [{ text: block.content || "[Embedded image]" }],
        });
        break;
      }

      case "table": {
        const rawRows = block.content.split("\n").filter((r) => r.trim());
        if (rawRows.length === 0) break;

        // Parse tab-separated cells per row
        const parsedRows = rawRows.map((r) => r.split("\t"));

        // Pad shorter rows so all rows have the same column count
        const maxCols = Math.max(...parsedRows.map((r) => r.length));
        for (const row of parsedRows) {
          while (row.length < maxCols) row.push("");
        }

        // Build DocTableRow[] with cell-level detection segments
        const tableRows: DocTableRow[] = parsedRows.map((cellTexts, ri) => ({
          cells: cellTexts.map((cellText): DocTableCell => ({
            segments: cellText.trim()
              ? buildSegmentsForText(cellText.trim(), detections)
              : [],
            ...(ri === 0 ? { isHeader: true } : {}),
          })),
        }));

        paragraphs.push({
          type: "table",
          page: pageNumber,
          segments: [], // Table uses rows/cells, not direct segments
          rows: tableRows,
        });
        break;
      }

      case "metadata": {
        const segments = buildSegmentsForText(block.content, detections);
        paragraphs.push({
          type: "paragraph",
          page: pageNumber,
          segments,
        });
        break;
      }

      default: {
        // Unknown block type — render as paragraph
        const segments = buildSegmentsForText(block.content, detections);
        paragraphs.push({
          type: "paragraph",
          page: pageNumber,
          segments,
        });
        break;
      }
    }
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Detection coverage verification
// ---------------------------------------------------------------------------

/**
 * Verify that every detection was matched to at least one segment in the
 * content. Logs warnings for unmatched detections but does not throw.
 *
 * This catches text mismatches between htmlToContentBlocks (which strips HTML)
 * and extractRawText (which produces slightly different whitespace/encoding).
 */
export function verifyDetectionCoverage(
  content: DocParagraph[],
  detections: DetectionInput[],
): string[] {
  // Collect all detection IDs that appear in segments
  const matchedIds = new Set<string>();

  function collectFromParagraphs(paras: DocParagraph[]) {
    for (const para of paras) {
      for (const seg of para.segments) {
        if (seg.detectionId) matchedIds.add(seg.detectionId);
      }
      if (para.items) {
        collectFromParagraphs(para.items);
      }
      if (para.rows) {
        for (const row of para.rows) {
          for (const cell of row.cells) {
            for (const seg of cell.segments) {
              if (seg.detectionId) matchedIds.add(seg.detectionId);
            }
          }
        }
      }
    }
  }

  collectFromParagraphs(content);

  const unmatched: string[] = [];
  for (const det of detections) {
    if (!matchedIds.has(det.id)) {
      const msg = `Detection ${det.id} (type=${det.type}, text="${det.text.slice(0, 50)}") not matched to any block`;
      log.warn(msg);
      unmatched.push(msg);
    }
  }

  if (unmatched.length > 0) {
    log.warn(`${unmatched.length} of ${detections.length} detection(s) not matched to structured content`);
  }

  return unmatched;
}
