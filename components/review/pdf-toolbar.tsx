"use client";

import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

interface PdfToolbarProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  downloadUrl?: string;

  // Dual-panel toggle (Slice B). When `dualPanelAvailable` is false
  // (e.g. content area narrower than the 1280px collapse breakpoint),
  // the toggle is not rendered at all — there's no dual panel to
  // toggle off of. `showPreview` controls the RIGHT (redaction-preview)
  // panel; the LEFT (interactive primary) panel is always visible.
  dualPanelAvailable?: boolean;
  showPreview?: boolean;
  onToggleShowPreview?: () => void;
}

export default function PdfToolbar({
  currentPage,
  totalPages,
  scale,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  downloadUrl,
  dualPanelAvailable = false,
  showPreview = true,
  onToggleShowPreview,
}: PdfToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-card border-b border-border">
      <button
        onClick={onZoomOut}
        className="btn-ghost p-1"
        title="Zoom out"
        disabled={scale <= 0.5}
      >
        <ZoomOut size={14} />
      </button>
      <span className="text-[10px] font-mono text-txt-secondary w-10 text-center">
        {Math.round(scale * 100)}%
      </span>
      <button
        onClick={onZoomIn}
        className="btn-ghost p-1"
        title="Zoom in"
        disabled={scale >= 3}
      >
        <ZoomIn size={14} />
      </button>
      <button
        onClick={onFitWidth}
        className="btn-ghost p-1"
        title="Fit to width"
      >
        <Maximize2 size={14} />
      </button>

      <div className="h-4 w-px bg-border mx-1" />

      {dualPanelAvailable && onToggleShowPreview && (
        <>
          <button
            onClick={onToggleShowPreview}
            className="btn-ghost p-1"
            title={showPreview ? "Hide redaction preview — show original only" : "Show redaction preview alongside original"}
            aria-pressed={showPreview}
            aria-label={showPreview ? "Hide preview" : "Show preview"}
          >
            {showPreview ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </button>
          <div className="h-4 w-px bg-border mx-1" />
        </>
      )}

      <span className="text-[10px] text-txt-secondary">
        Page {currentPage} of {totalPages}
      </span>

      {downloadUrl && (
        <>
          <div className="flex-1" />
          <a
            href={downloadUrl}
            download
            className="btn-ghost p-1"
            title="Download original"
          >
            <Download size={14} />
          </a>
        </>
      )}
    </div>
  );
}
