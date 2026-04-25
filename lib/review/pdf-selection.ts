/**
 * Pure helpers for PDF-text-layer-based manual-detection selection.
 *
 * Slice C of the viewer rework replaces the HTML-branch
 * `handleTextSelection` — which read `parentNode.dataset.page` from a
 * reconstructed paragraph tree — with a pdf.js-text-layer-aware
 * equivalent. The coordinate translation from the pixel-space
 * `Range.getBoundingClientRect()` to percentage-space bboxes (the shape
 * stored on `Detection.posX/Y/W/H`) is kept here so it is
 * unit-testable without a DOM.
 *
 * Callers from React live in review-client.tsx; they hand this helper
 * a shape-matching browser `Selection` and the page-wrapper + bbox
 * rectangles, and receive either a validated selection payload or null
 * (indicating: no selection, cross-page, degenerate, empty).
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PdfSelectionInput {
  /** Trimmed selected text. */
  text: string;
  /** Page number the anchor node sits on (1-indexed). */
  anchorPage: number;
  /** Page number the focus node sits on — must match anchorPage. */
  focusPage: number;
  /** Bounding rect of the selection (e.g. `range.getBoundingClientRect()`). */
  selectionRect: Rect;
  /** Bounding rect of the page wrapper element (the anchorPage element). */
  wrapperRect: Rect;
}

export interface PdfSelectionBbox {
  text: string;
  page: number;
  posX: number; // 0-100 percentage of wrapper width
  posY: number; // 0-100 percentage of wrapper height
  posW: number;
  posH: number;
  /**
   * Screen-space position for the popover when there's no mouse event
   * (keyboard-driven selection). Bottom-right of the selection rect.
   */
  popoverAnchor: { x: number; y: number };
}

const MIN_TEXT_LENGTH = 2;
const MIN_PERCENT = 0.1;

/**
 * Validate + translate a PDF text-layer selection into bbox percentages.
 *
 * Returns null (no popover) when:
 *   - text is empty / whitespace / <2 chars
 *   - anchorPage !== focusPage (cross-page selection)
 *   - wrapperRect has zero width/height (layout race; try again next tick)
 *   - computed posW/posH falls below MIN_PERCENT (degenerate)
 *
 * Whitespace normalisation: pdf.js extracts text in layout-preserved
 * order, so a multi-line selection in the text layer arrives with
 * embedded `\n` characters reflecting visual line wraps rather than
 * logical text flow. After trimming, collapse every run of whitespace
 * (newlines, tabs, multiple spaces) to a single space so the popover
 * receives a single-line normalised string. Edge case: hyphenated
 * tokens that wrap across a line — e.g. extracted as `"12-3056-\n0789123-00"`
 * — become `"12-3056- 0789123-00"`. The reviewer can edit the popover
 * textarea to remove the inserted space; the userEditedText flag in
 * `manual-detection-popover.tsx` (Slice B2) protects that edit from
 * being clobbered by subsequent prop updates.
 */
export function computePdfSelectionBbox(
  input: PdfSelectionInput,
): PdfSelectionBbox | null {
  const text = input.text.trim().replace(/\s+/g, " ");
  if (text.length < MIN_TEXT_LENGTH) return null;
  if (input.anchorPage !== input.focusPage) return null;

  const { selectionRect: s, wrapperRect: w } = input;
  if (w.width <= 0 || w.height <= 0) return null;

  const posX = ((s.left - w.left) / w.width) * 100;
  const posY = ((s.top - w.top) / w.height) * 100;
  const posW = (s.width / w.width) * 100;
  const posH = (s.height / w.height) * 100;
  if (posW < MIN_PERCENT || posH < MIN_PERCENT) return null;

  return {
    text,
    page: input.anchorPage,
    posX,
    posY,
    posW,
    posH,
    popoverAnchor: { x: s.right, y: s.bottom },
  };
}

/**
 * Walks from a DOM node up to the nearest ancestor with
 * `data-page-number` (the PdfViewer's per-page wrapper — Slice B).
 * Returns `{ element, page }` when found, or null when the node isn't
 * inside any wrapper (e.g. selection started on non-PDF chrome).
 *
 * Extracted so the React handler can unit-test its findWrapper logic
 * via a minimal DOM mock. The runtime implementation is trivial;
 * correctness is the safety of the ancestor walk.
 */
export function findPdfPageWrapper(
  node: Node | null,
): { element: HTMLElement; page: number } | null {
  // Duck-type rather than `instanceof HTMLElement` — lets the helper be
  // unit-tested without jsdom. Any object that exposes a `dataset` with
  // a `pageNumber` entry and a `parentNode` walkable chain qualifies.
  // At runtime against a real DOM this is equivalent; in tests we feed
  // in plain objects shaped like DOM nodes.
  type Walkable = { dataset?: { pageNumber?: string }; parentNode?: Walkable | null };
  let current = node as unknown as Walkable | null;
  while (current) {
    const pageNum = current.dataset?.pageNumber;
    if (typeof pageNum === "string" && pageNum.length > 0) {
      const page = Number.parseInt(pageNum, 10);
      if (Number.isFinite(page) && page > 0) {
        return { element: current as unknown as HTMLElement, page };
      }
    }
    current = current.parentNode ?? null;
  }
  return null;
}
