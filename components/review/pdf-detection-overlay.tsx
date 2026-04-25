"use client";

import { cn } from "@/lib/utils";
import { handleOverlayBoxKeyDown } from "./overlay-key-handler";
import type { MergedOverlay } from "@/lib/review/overlay-grouping";

export { handleOverlayBoxKeyDown };

interface PdfDetectionOverlayProps {
  pageNumber: number;
  /**
   * Pre-merged overlay groups from `mergeByBbox`. Each group represents
   * one or more detections that share an exact bbox; rendering one
   * group avoids the stacked-translucent-fill shading bug (Slice B2).
   * Sidebar enumeration is unaffected — it still consumes the raw
   * detection list directly.
   */
  overlays: MergedOverlay[];
  selectedDetectionId: string | null;
  onDetectionClick: (detectionId: string) => void;
}

// All three states render as translucent /25 fills so the underlying
// document text remains readable on the LEFT (interactive) panel.
//
// Borders removed in the Slice-B1 follow-up — the saturated /500 ring
// around each highlight made tight glyph clusters (table cells, short
// labels) visually noisy and competed with the underlying text. The
// fill alone is sufficient signal; selection state still has its
// `ring-2 ring-brand-primary` ring on top of the fill.
function statusColor(status: string): string {
  switch (status) {
    case "accepted":
      return "bg-red-500/25";       // Red = will redact
    case "rejected":
      return "bg-emerald-500/25";   // Green = will keep
    default:
      return "bg-amber-500/25";     // Yellow = pending
  }
}

// Each highlight grows ~2px past the glyph bounding box so the colour
// has a small breathing room around the text — easier to pick out at
// a glance, especially on dense tables.
const HIGHLIGHT_GROW_PX = 2;

function highlightStyle(posX: number, posY: number, posW: number, posH: number) {
  return {
    left:   `calc(${posX}% - ${HIGHLIGHT_GROW_PX}px)`,
    top:    `calc(${posY}% - ${HIGHLIGHT_GROW_PX}px)`,
    width:  `calc(${posW}% + ${HIGHLIGHT_GROW_PX * 2}px)`,
    height: `calc(${posH}% + ${HIGHLIGHT_GROW_PX * 2}px)`,
  };
}

export default function PdfDetectionOverlay({
  pageNumber,
  overlays,
  selectedDetectionId,
  onDetectionClick,
}: PdfDetectionOverlayProps) {
  const pageOverlays = overlays.filter((o) => o.page === pageNumber);

  if (pageOverlays.length === 0) return null;

  return (
    // z-index: 3 sits the overlay above pdf.js's text layer (z-index 2),
    // so clicks on boxes capture cleanly. Text selection still works in
    // the gaps between boxes because pointer-events-none passes through
    // to the underlying text layer. Individual boxes set pointer-events
    // back to auto so they remain focusable and clickable.
    <div className="absolute inset-0 pointer-events-none z-[3]">
      {pageOverlays.map((merged) => {
        // Skip overlays with no bbox data (0,0,0,0).
        if (merged.posW === 0 && merged.posH === 0) return null;

        // The merged overlay is "selected" if the currently-selected
        // sidebar row is ANY detection in the group, not just the
        // primary. So clicking a non-primary row in the sidebar still
        // visibly highlights the merged overlay on the canvas.
        const isSelected =
          selectedDetectionId !== null && merged.detectionIds.includes(selectedDetectionId);
        const activate = () => onDetectionClick(merged.primaryId);

        // ARIA: list every distinct type in the group. For a single-
        // detection group this reads exactly like the pre-merge label.
        // For a multi-detection group (e.g. bank-account + phone on
        // the same row) it surfaces both so screen readers convey the
        // full context.
        const ariaLabel = `${merged.types.join(", ")}: ${merged.text}`;
        const titleText = merged.text.length > 50 ? merged.text.slice(0, 50) + "..." : merged.text;

        return (
          <button
            type="button"
            key={merged.primaryId}
            role="button"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-pressed={isSelected}
            data-overlay-merged-count={merged.detectionIds.length}
            className={cn(
              // `all: unset` is avoided — Tailwind's preflight already
              // zeroes out most button defaults; explicit `cursor-pointer`
              // + box-sizing keeps things deterministic. Borders dropped
              // in the Slice-B1 follow-up; the selection ring is the
              // only edge effect.
              "absolute rounded-sm cursor-pointer pointer-events-auto transition-all duration-150 box-border p-0 bg-clip-padding",
              statusColor(merged.status),
              isSelected && "ring-2 ring-brand-primary ring-offset-1 animate-pulse"
            )}
            style={highlightStyle(merged.posX, merged.posY, merged.posW, merged.posH)}
            onClick={(e) => {
              e.stopPropagation();
              activate();
            }}
            onKeyDown={(e) => {
              if (handleOverlayBoxKeyDown(e.key, activate)) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            title={`${merged.types.join(", ")}: ${titleText} (${merged.confidence}%)`}
          />
        );
      })}
    </div>
  );
}
