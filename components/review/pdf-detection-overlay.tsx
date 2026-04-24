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

function statusColor(status: string): string {
  switch (status) {
    case "accepted":
      return "border-gray-900 bg-gray-900/80";   // Black bar = redacted
    case "rejected":
      return "border-emerald-400 bg-emerald-400/15"; // Green = cleared
    default:
      return "border-amber-500 bg-amber-500/25";     // Yellow = pending
  }
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
              // zeroes out most button defaults, and keeping `border-2 /
              // rounded-sm / bg-*` driven from statusColor needs normal
              // class composition. Explicit `cursor-pointer` + box-sizing
              // keeps things deterministic.
              "absolute border-2 rounded-sm cursor-pointer pointer-events-auto transition-all duration-150 box-border p-0 bg-clip-padding",
              statusColor(det.status),
              isSelected && "ring-2 ring-brand-primary ring-offset-1 animate-pulse"
            )}
            style={{
              left: `${det.posX}%`,
              top: `${det.posY}%`,
              width: `${det.posW}%`,
              height: `${det.posH}%`,
            }}
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
