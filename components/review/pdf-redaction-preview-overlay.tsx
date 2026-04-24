"use client";

/**
 * Slice B redaction preview overlay — display-only companion to the
 * left-panel `PdfDetectionOverlay`.
 *
 * For each detection with status === "accepted" on the given page,
 * draws a solid black rectangle at the detection's percentage
 * coordinates. The rectangle simulates what the page will look like
 * post-redaction, without running the real PyMuPDF pipeline — the
 * cheap "overlay rather than server-built PDF" call from the
 * 2026-04-24 dual-panel spike (option 1), which updates instantly as
 * reviewers accept / reject detections.
 *
 * Intentionally not interactive:
 *   - `<div>` elements, not `<button>` — nothing to click.
 *   - Container AND rectangles set `pointer-events: none` so the click
 *     passes through to the underlying text layer (where Slice C will
 *     wire up manual detection).
 *   - `aria-hidden` on the container so screen readers don't announce
 *     the same detection twice (once from the left-panel buttons,
 *     again from here).
 *   - No status styling, no border, no selected-state ring. This is a
 *     visual preview of the end-state redaction, not a review surface.
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

export default function PdfRedactionPreviewOverlay({
  pageNumber,
  detections,
}: PdfRedactionPreviewOverlayProps) {
  const pageAccepted = detections.filter(
    (d) => d.page === pageNumber && d.status === "accepted" && (d.posW > 0 || d.posH > 0),
  );

  if (pageAccepted.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[3]"
      aria-hidden="true"
      data-redaction-preview="true"
    >
      {pageAccepted.map((d) => (
        <div
          key={d.id}
          className="absolute bg-veil-redaction-black pointer-events-none"
          style={{
            left: `${d.posX}%`,
            top: `${d.posY}%`,
            width: `${d.posW}%`,
            height: `${d.posH}%`,
          }}
        />
      ))}
    </div>
  );
}
