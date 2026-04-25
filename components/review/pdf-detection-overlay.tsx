"use client";

import { cn } from "@/lib/utils";
import { handleOverlayBoxKeyDown } from "./overlay-key-handler";

export { handleOverlayBoxKeyDown };

interface DetectionBox {
  id: string;
  type: string;
  text: string;
  confidence: number;
  page: number;
  posX: number; // 0-100 percentage
  posY: number;
  posW: number;
  posH: number;
  status: string;
}

interface PdfDetectionOverlayProps {
  pageNumber: number;
  detections: DetectionBox[];
  selectedDetectionId: string | null;
  onDetectionClick: (detectionId: string) => void;
}

// All three states render as translucent /25 fills so the underlying
// document text remains readable on the LEFT (interactive) panel. The
// previous accepted-state colour was bg-gray-900/80 — opaque enough to
// obscure text, conflating the review surface with the RIGHT pane's
// redaction preview. The previous rejected-state /15 fill was so faint
// it read as "no overlay" alongside the /25 amber pending fill, so it
// was bumped to /25 for visual parity.
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
// a glance, especially on dense tables. Applied to all three LEFT-pane
// states (pending / accepted / rejected) and the RIGHT pane's pending
// highlight; the RIGHT pane's accepted black rectangle stays tight to
// the glyph so the redaction preview obscures only what would actually
// be redacted.
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
  detections,
  selectedDetectionId,
  onDetectionClick,
}: PdfDetectionOverlayProps) {
  const pageDetections = detections.filter((d) => d.page === pageNumber);

  if (pageDetections.length === 0) return null;

  return (
    // z-index: 3 sits the overlay above pdf.js's text layer (z-index 2),
    // so clicks on boxes capture cleanly. Text selection still works in
    // the gaps between boxes because pointer-events-none passes through
    // to the underlying text layer. Individual boxes set pointer-events
    // back to auto so they remain focusable and clickable.
    <div className="absolute inset-0 pointer-events-none z-[3]">
      {pageDetections.map((det) => {
        // Skip detections with no bbox data (0,0,0,0)
        if (det.posW === 0 && det.posH === 0) return null;

        const isSelected = selectedDetectionId === det.id;
        const activate = () => onDetectionClick(det.id);

        return (
          <button
            type="button"
            key={det.id}
            role="button"
            tabIndex={0}
            aria-label={`${det.type}: ${det.text}`}
            aria-pressed={isSelected}
            className={cn(
              // `all: unset` is avoided — Tailwind's preflight already
              // zeroes out most button defaults; explicit `cursor-pointer`
              // + box-sizing keeps things deterministic. Borders removed
              // in the Slice-B1 follow-up (see statusColor comment); the
              // selection ring is the only edge effect now.
              "absolute rounded-sm cursor-pointer pointer-events-auto transition-all duration-150 box-border p-0 bg-clip-padding",
              statusColor(det.status),
              isSelected && "ring-2 ring-brand-primary ring-offset-1 animate-pulse"
            )}
            style={highlightStyle(det.posX, det.posY, det.posW, det.posH)}
            onClick={(e) => {
              e.stopPropagation();
              activate();
            }}
            onKeyDown={(e) => {
              if (handleOverlayBoxKeyDown(e.key, activate)) {
                // Block default scroll-on-space; let Enter fall through
                // for screen readers that synthesise activation events.
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            title={`${det.type}: ${det.text.length > 50 ? det.text.slice(0, 50) + "..." : det.text} (${det.confidence}%)`}
          />
        );
      })}
    </div>
  );
}
