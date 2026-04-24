"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import PdfDetectionOverlay from "./pdf-detection-overlay";
import PdfRedactionPreviewOverlay from "./pdf-redaction-preview-overlay";
import PdfToolbar from "./pdf-toolbar";

// Same-origin worker — copied into public/ by scripts/copy-pdfjs-worker.ts
// (postinstall). Third-party CDN removed for data-sovereignty + CSP.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/**
 * Slice B dual-panel layout (viewer rework, April 2026).
 *
 * Architecture — single `<Document>` instance per doc with paired
 * `<Page>` siblings per page number inside a flex-row. One scroll
 * container. Zoom is shared state, so both panels re-layout in
 * lockstep on scale change. The 2026-04-24 dual-panel spike prototyped
 * the two-`<Document>` alternative with scroll-sync refs and
 * explicitly recommends against it (worker contention, scroll-sync
 * bugs, memory cost, no user win at this stage).
 *
 * Responsive collapse — below 1280px content-area width the right
 * panel is hidden. `DUAL_PANEL_MIN_WIDTH` is the threshold, measured
 * against the ResizeObserver-watched `containerRef` (the scroll
 * container, which IS the content area). Using an RO rather than a
 * CSS container query because the viewer already owns a ResizeObserver
 * for `containerWidth` — reusing it keeps the dependency surface thin
 * (no `@tailwindcss/container-queries` plugin needed).
 *
 * `showOriginal` — session-local toggle on the toolbar. When off AND
 * dual-panel is otherwise available, the left panel is hidden via
 * `display: none` and the right panel widens. Kept mounted so toggling
 * back on is instant (no re-render of the left panel's canvases).
 */

const DUAL_PANEL_MIN_WIDTH = 1280;
const PANEL_GAP_PX = 16;

interface DetectionForOverlay {
  id: string;
  type: string;
  text: string;
  confidence: number;
  page: number;
  position: { x: number; y: number; w: number; h: number };
  status: string;
}

interface PdfViewerProps {
  fileUrl: string;
  detections: DetectionForOverlay[];
  selectedDetectionId: string | null;
  onDetectionClick: (detectionId: string) => void;
  detectionStates: Record<string, { status: string }>;
  /**
   * Manual-detection hook — fired on mouseup AND keyup inside the
   * viewer so Shift+Arrow keyboard selection also triggers the
   * popover (Slice C). Mouse-originated events pass clientX/clientY
   * for popover anchoring; keyboard events leave them undefined and
   * the consumer falls back to the selection rect.
   */
  onTextSelection?: (e: { clientX?: number; clientY?: number }) => void;
}

export default function PdfViewer({
  fileUrl,
  detections,
  selectedDetectionId,
  onDetectionClick,
  detectionStates,
  onTextSelection,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showOriginal, setShowOriginal] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Measure content-area width. Single ResizeObserver drives both the
  // fit-to-width math and the dual-panel breakpoint decision.
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Dual-panel only when the content area is ≥1280px wide. Below that
  // the right panel is hidden (design call documented in the 2026-04-24
  // spike — at <1280 the halved panel width puts body text below
  // readable size even on a zoomed canonical).
  const dualPanelAvailable = containerWidth >= DUAL_PANEL_MIN_WIDTH;
  const showLeftPanel = dualPanelAvailable && showOriginal;

  // Width math: right panel always renders. Left panel width matches
  // right when dual, collapses to zero otherwise. PANEL_GAP_PX is the
  // flex `gap` between the two panels — deducted once so both panel
  // widths account for it.
  const rightPanelWidth = useMemo(() => {
    if (containerWidth <= 0) return 0;
    if (!showLeftPanel) return containerWidth;
    return Math.max(0, (containerWidth - PANEL_GAP_PX) / 2);
  }, [containerWidth, showLeftPanel]);
  const leftPanelWidth = showLeftPanel ? rightPanelWidth : 0;

  // Track visible page. Observe the per-page wrapper (one element per
  // page number, regardless of whether one or two panels render inside
  // it) so the "current page" indicator doesn't double-trigger with
  // dual-panel mounted.
  useEffect(() => {
    if (numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = parseInt(
              (entry.target as HTMLElement).dataset.pageNumber || "1",
              10
            );
            setCurrentPage(pageNum);
          }
        }
      },
      { threshold: 0.5 }
    );

    for (const [, el] of Object.entries(pageRefs.current)) {
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [numPages]);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
    },
    []
  );

  // Wire keyboard-selection support (Shift+Arrow, etc). The mouseup
  // pathway is bound as a React prop below; keyup has to attach
  // imperatively because React's synthetic-event system doesn't fire
  // keyup on non-focused elements reliably. Scoped to the scroll
  // container so global keyups outside the viewer don't fire it.
  useEffect(() => {
    if (!onTextSelection) return;
    const el = containerRef.current;
    if (!el) return;
    const handler = () => onTextSelection({});
    el.addEventListener("keyup", handler);
    return () => el.removeEventListener("keyup", handler);
  }, [onTextSelection]);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(3, s + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(0.5, s - 0.25));
  }, []);

  const handleFitWidth = useCallback(() => {
    setScale(1);
  }, []);

  const handleToggleShowOriginal = useCallback(() => {
    setShowOriginal((v) => !v);
  }, []);

  // Map detections once for both overlays — same shape the existing
  // PdfDetectionOverlay expects, plus the preview overlay filters on
  // status internally.
  const overlayDetections = useMemo(() => {
    return detections.map((d) => ({
      id: d.id,
      type: d.type,
      text: d.text,
      confidence: d.confidence,
      page: d.page,
      posX: d.position.x,
      posY: d.position.y,
      posW: d.position.w,
      posH: d.position.h,
      status: detectionStates[d.id]?.status ?? d.status,
    }));
  }, [detections, detectionStates]);

  // Scroll to a page when a sidebar detection is selected. Scrolls the
  // per-page wrapper (one element regardless of panel count) so both
  // panels line up at the same row.
  useEffect(() => {
    if (!selectedDetectionId) return;
    const det = detections.find((d) => d.id === selectedDetectionId);
    if (!det) return;
    const pageEl = pageRefs.current[det.page];
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedDetectionId, detections]);

  // Page width for the <Page> component. Subtract a small gutter
  // (24px, matching the original `- 48` when the single panel spanned
  // the full container) so shadow-md has room to render.
  const panelInnerGutter = 24;
  const leftPageWidth = leftPanelWidth > 0 ? Math.max(0, leftPanelWidth - panelInnerGutter) : undefined;
  const rightPageWidth = rightPanelWidth > 0 ? Math.max(0, rightPanelWidth - panelInnerGutter) : undefined;

  return (
    <div className="flex flex-col h-full">
      <PdfToolbar
        currentPage={currentPage}
        totalPages={numPages}
        scale={scale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitWidth={handleFitWidth}
        downloadUrl={fileUrl}
        dualPanelAvailable={dualPanelAvailable}
        showOriginal={showOriginal}
        onToggleShowOriginal={handleToggleShowOriginal}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-100"
        data-dual-panel-active={showLeftPanel ? "true" : "false"}
        tabIndex={-1}
        onMouseUp={
          onTextSelection
            ? (e) => onTextSelection({ clientX: e.clientX, clientY: e.clientY })
            : undefined
        }
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-brand-primary border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-txt-secondary">Loading document...</span>
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center py-20 text-txt-secondary">
              <p className="text-sm font-medium">Failed to load PDF</p>
              <p className="text-xs mt-1">The document may be corrupted or unavailable.</p>
              <a
                href={fileUrl}
                download
                className="btn-primary text-xs mt-3"
              >
                Download Original
              </a>
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div
              key={pageNum}
              ref={(el) => {
                pageRefs.current[pageNum] = el;
              }}
              data-page-number={pageNum}
              data-page-row="true"
              className="flex items-start justify-center mb-4"
              style={{ gap: `${PANEL_GAP_PX}px` }}
            >
              {/* LEFT PANEL — canonical PDF + interactive detection overlay.
                  Kept mounted but hidden via display:none when toggled
                  off, so toggling back is instant (no canvas re-render). */}
              <div
                className={`relative shadow-md bg-white${showLeftPanel ? "" : " hidden"}`}
                style={{ width: leftPanelWidth > 0 ? `${leftPanelWidth}px` : undefined }}
                data-panel="original"
              >
                <Page
                  pageNumber={pageNum}
                  scale={scale}
                  width={leftPageWidth}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                />
                <PdfDetectionOverlay
                  pageNumber={pageNum}
                  detections={overlayDetections}
                  selectedDetectionId={selectedDetectionId}
                  onDetectionClick={onDetectionClick}
                />
              </div>

              {/* RIGHT PANEL — canonical PDF + redaction preview (display-only). */}
              <div
                className="relative shadow-md bg-white"
                style={{ width: rightPanelWidth > 0 ? `${rightPanelWidth}px` : undefined }}
                data-panel="redacted-preview"
              >
                <Page
                  pageNumber={pageNum}
                  scale={scale}
                  width={rightPageWidth}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                  canvasRef={(c) => {
                    // aria-hidden the right-panel canvas so screen readers
                    // don't announce the same document twice. Overlay-level
                    // aria-hidden already handled in the preview component.
                    if (c) c.setAttribute("aria-hidden", "true");
                  }}
                />
                <PdfRedactionPreviewOverlay
                  pageNumber={pageNum}
                  detections={overlayDetections}
                />
              </div>
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
