"use client";

/**
 * Slice B redaction preview overlay — display-only companion to the
 * left-panel `PdfDetectionOverlay`.
 *
 * Per-status rendering:
 *   - `accepted` → solid black rectangle (`bg-veil-redaction-black`).
 *     Simulates what the page will look like post-redaction. Opaque
 *     to confirm the text WILL be obscured.
 *   - `pending`  → translucent yellow highlight matching the LEFT
 *     pane's pending visual exactly (`bg-amber-500/25` +
 *     `border-2 border-amber-500 rounded-sm`). Communicates "still
 *     undecided — won't be redacted unless accepted". The reviewer
 *     sees the same yellow on both panes for the same detection.
 *   - `rejected` → no overlay. The text appears as if no detection
 *     existed there, confirming the reviewer's "this is fine, do
 *     not redact" call.
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
 *   - No selected-state ring, no click handlers. This is a visual
 *     preview of the end-state redaction, not a review surface.
 *
 * Z-index intentionally matches the left-panel detection overlay
 * (`z-[3]`) — both sit above pdf.js's text layer (z-index 2). See
 * Slice A for the original stacking decision.
 */

interface DetectionForPreview {
  id: string;
  page: number;
  posX: number; // 0-100 percentage
  posY: number;
  posW: number;
  posH: number;
  status: string;
}

interface PdfRedactionPreviewOverlayProps {
  pageNumber: number;
  detections: DetectionForPreview[];
}

// Display-only — `pointer-events-none` everywhere; the LEFT pane's
// `bg-amber-500/25 border-2 border-amber-500 rounded-sm` for pending
// is mirrored here so the same detection reads the same colour on
// both panels. Accepted gets the opaque redaction-preview black.
// Rejected returns null so the text shows through unobscured.
function rightOverlayClass(status: string): string | null {
  switch (status) {
    case "accepted":
      return "absolute bg-veil-redaction-black pointer-events-none";
    case "rejected":
      return null;
    default:
      return "absolute bg-amber-500/25 border-2 border-amber-500 rounded-sm pointer-events-none";
  }
}

export default function PdfRedactionPreviewOverlay({
  pageNumber,
  detections,
}: PdfRedactionPreviewOverlayProps) {
  const pageVisible = detections.filter(
    (d) =>
      d.page === pageNumber &&
      (d.posW > 0 || d.posH > 0) &&
      rightOverlayClass(d.status) !== null,
  );

  if (pageVisible.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[3]"
      aria-hidden="true"
      data-redaction-preview="true"
    >
      {pageVisible.map((d) => {
        const className = rightOverlayClass(d.status);
        if (!className) return null;
        return (
          <div
            key={d.id}
            className={className}
            data-overlay-status={d.status}
            style={{
              left: `${d.posX}%`,
              top: `${d.posY}%`,
              width: `${d.posW}%`,
              height: `${d.posH}%`,
            }}
          />
        );
      })}
    </div>
  );
}
