/**
 * Page-context extraction (Phase 12.4 — Umbra v2).
 *
 * Captures a ±N-char window of source page text around a detection's
 * matched text span. The result is stored on `Detection.pageContext`
 * and surfaced in the Tray's cluster expand view to help reviewers
 * disambiguate between two clusters of the same text in different
 * contexts (e.g. "Sarah Mitchell from Finance" vs "Sarah Mitchell the
 * complainant").
 *
 * Returns null when the detection text doesn't appear verbatim in the
 * page text — happens when the AI emits a paraphrase or normalises
 * punctuation. The Tray UI falls back to the existing aiExplanation
 * field in that case.
 *
 * Boundaries are clamped with leading / trailing ellipsis when the
 * window slices into the middle of the page text.
 */
const DEFAULT_WINDOW_CHARS = 100;
const ELLIPSIS = "…";

export function extractPageContext(
  pageText: string,
  detectionText: string,
  windowChars: number = DEFAULT_WINDOW_CHARS,
): string | null {
  if (!pageText || !detectionText) return null;
  const idx = pageText.indexOf(detectionText);
  if (idx === -1) return null;

  const start = Math.max(0, idx - windowChars);
  const end = Math.min(
    pageText.length,
    idx + detectionText.length + windowChars,
  );
  let snippet = pageText.slice(start, end);
  if (start > 0) snippet = ELLIPSIS + snippet;
  if (end < pageText.length) snippet = snippet + ELLIPSIS;
  return snippet;
}
