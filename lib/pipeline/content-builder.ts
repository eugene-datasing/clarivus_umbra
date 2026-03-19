/**
 * Content builder for the Veil review UI.
 *
 * Takes extracted pages and their associated detections and produces a
 * DocParagraph[] structure that the review page can render.  Each paragraph
 * is split into segments -- normal text and detection-tagged spans -- so the
 * frontend can highlight and annotate detected entities inline.
 */

import type { DocParagraph, DocSegment } from "@/lib/db/mappers";
import type { ExtractedPage } from "./extract";

// ---------------------------------------------------------------------------
// Types for the detection input
// ---------------------------------------------------------------------------

export interface DetectionInput {
  id: string;
  type: string;
  text: string;
  page: number;
  confidence: number;
  suggestedGround?: string | null;
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
function buildSegmentsForText(
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
    if (idx === -1) {
      idx = text.toLowerCase().indexOf(det.text.toLowerCase());
    }
    if (idx === -1) {
      idx = normText.indexOf(normalizeWs(det.text).toLowerCase());
    }

    if (idx !== -1) {
      markers.push({
        start: idx,
        end: idx + det.text.length,
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
