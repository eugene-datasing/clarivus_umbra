"use client";

import type { MergedOverlay } from "@/lib/review/overlay-grouping";

/**
 * Slice B redaction preview overlay — display-only companion to the
 * left-panel `PdfDetectionOverlay`.
 *
 * Per-status rendering (driven by the merged overlay's resolved
 * status — see `mergeByBbox` for the priority rule):
 *   - `accepted` → solid black rectangle (`bg-veil-redaction-black`).
 *     Simulates what the page will look like post-redaction. Opaque
 *     to confirm the text WILL be obscured. Stays TIGHT to the glyph
 *     bounding box (no grow margin — the preview should obscure only
 *     what would actually be redacted).
 *   - `pending`  → translucent yellow highlight matching the LEFT
 *     pane's pending visual exactly (`bg-amber-500/25`, no border).
 *     Communicates "still undecided — won't be redacted unless
 *     accepted". The reviewer sees the same yellow on both panes for
 *     the same detection group. Grown by ~2px on each side for visual
 *     breathing room (same `HIGHLIGHT_GROW_PX` rationale as the LEFT
 *     pane).
 *   - `rejected` → no overlay. The text appears as if no detection
 *     existed there, confirming the reviewer's "this is fine, do
 *     not redact" call.
 *
 * Slice B2: input is now `MergedOverlay[]` (pre-grouped by exact bbox
 * match in `mergeByBbox`). Stacked detections at the same bbox render
 * as a single overlay with the priority-resolved status, fixing the
 * doubled-translucent-fill shading bug visible on the LEFT pane.
 *
 * The cheap "overlay rather than server-built PDF" approach from the
 * 2026-04-24 dual-panel spike (option 1) — updates instantly as
 * reviewers change status without re-running the PyMuPDF pipeline.
 *
 * Intentionally not interactive:
 *   - `<div>` elements, not `<button>` — nothing to click.
 *   - Container AND rectangles set `pointer-events: none` so the click
 *     passes through to the underlying text layer (where Slice C wires
 *     up manual detection).
 *   - `aria-hidden` on the container so screen readers don't announce
 *     the same detection twice (once from the left-panel buttons,
 *     again from here).
 *   - `select-none` is applied at the panel-wrapper level in
 *     `pdf-viewer.tsx` so the right-pane text layer is non-selectable
 *     and a drag-select on the right pane can't extend visually into
 *     the next page's left pane (DOM order is paired-rows: L1 R1 L2
 *     R2 …, and native browser selection extends through DOM order).
 *   - No selected-state ring, no click handlers. This is a visual
 *     preview of the end-state redaction, not a review surface.
 *
 * Z-index intentionally matches the left-panel detection overlay
 * (`z-[3]`) — both sit above pdf.js's text layer (z-index 2). See
 * Slice A for the original stacking decision.
 */

interface PdfRedactionPreviewOverlayProps {
  pageNumber: number;
  /** Pre-merged overlay groups from `mergeByBbox` (Slice B2). */
  overlays: MergedOverlay[];
}

// Display-only — `pointer-events-none` everywhere; the LEFT pane's
// translucent yellow fill for pending is mirrored here so the same
// detection group reads the same colour on both panels. Accepted gets
// the opaque redaction-preview black. Rejected returns null so the
// text shows through unobscured.
//
// Borders removed in the Slice-B1 follow-up (matches LEFT pane
// rationale — fill alone is sufficient signal, less competition with
// the underlying text).
function rightOverlayClass(status: string): string | null {
  switch (status) {
    case "accepted":
      return "absolute bg-veil-redaction-black pointer-events-none";
    case "rejected":
      return null;
    default:
      return "absolute bg-amber-500/25 rounded-sm pointer-events-none";
  }
}

// Pending highlights grow ~2px past the glyph bbox (same value as the
// LEFT pane's `HIGHLIGHT_GROW_PX`) for visual breathing room. The
// accepted black rectangle stays tight — the redaction preview must
// obscure only what would actually be redacted in the export.
const HIGHLIGHT_GROW_PX = 2;

function rightOverlayStyle(status: string, posX: number, posY: number, posW: number, posH: number) {
  if (status === "accepted") {
    return {
      left:   `${posX}%`,
      top:    `${posY}%`,
      width:  `${posW}%`,
      height: `${posH}%`,
    };
  }
  return {
    left:   `calc(${posX}% - ${HIGHLIGHT_GROW_PX}px)`,
    top:    `calc(${posY}% - ${HIGHLIGHT_GROW_PX}px)`,
    width:  `calc(${posW}% + ${HIGHLIGHT_GROW_PX * 2}px)`,
    height: `calc(${posH}% + ${HIGHLIGHT_GROW_PX * 2}px)`,
  };
}

export default function PdfRedactionPreviewOverlay({
  pageNumber,
  overlays,
}: PdfRedactionPreviewOverlayProps) {
  const pageVisible = overlays.filter(
    (o) =>
      o.page === pageNumber &&
      (o.posW > 0 || o.posH > 0) &&
      rightOverlayClass(o.status) !== null,
  );

  if (pageVisible.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[3]"
      aria-hidden="true"
      data-redaction-preview="true"
    >
      {pageVisible.map((merged) => {
        const className = rightOverlayClass(merged.status);
        if (!className) return null;
        return (
          <div
            key={merged.primaryId}
            className={className}
            data-overlay-status={merged.status}
            data-overlay-merged-count={merged.detectionIds.length}
            style={rightOverlayStyle(merged.status, merged.posX, merged.posY, merged.posW, merged.posH)}
          />
        );
      })}
    </div>
  );
}
