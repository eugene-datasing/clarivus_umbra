"use client";

import { cn } from "@/lib/utils";

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
      return "border-red-500 bg-red-500/20";
    case "rejected":
      return "border-gray-400 bg-gray-400/10 opacity-40";
    default:
      return "border-amber-500 bg-amber-500/20";
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
    <div className="absolute inset-0 pointer-events-none">
      {pageDetections.map((det) => {
        // Skip detections with no bbox data (0,0,0,0)
        if (det.posW === 0 && det.posH === 0) return null;

        const isSelected = selectedDetectionId === det.id;

        return (
          <div
            key={det.id}
            className={cn(
              "absolute border-2 rounded-sm cursor-pointer pointer-events-auto transition-all duration-150",
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
              onDetectionClick(det.id);
            }}
            title={`${det.type}: ${det.text.length > 50 ? det.text.slice(0, 50) + "..." : det.text} (${det.confidence}%)`}
          />
        );
      })}
    </div>
  );
}
