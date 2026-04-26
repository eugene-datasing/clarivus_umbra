"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import PdfDetectionOverlay from "./pdf-detection-overlay";
import PdfRedactionPreviewOverlay from "./pdf-redaction-preview-overlay";
import PdfToolbar from "./pdf-toolbar";
import { mergeByBbox } from "@/lib/review/overlay-grouping";

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
 * Responsive collapse — below 1152px content-area width the RIGHT
 * (redaction-preview) panel is hidden, leaving the LEFT (interactive
 * primary view with detection overlay) at full width. `DUAL_PANEL_MIN_WIDTH`
 * is the threshold, measured against the ResizeObserver-watched
 * `containerRef` (the scroll container, which IS the content area).
 * Using an RO rather than a CSS container query because the viewer
 * already owns a ResizeObserver for `containerWidth` — reusing it
 * keeps the dependency surface thin (no `@tailwindcss/container-queries`
 * plugin needed). Pre-fix this was inverted (hid the LEFT, kept the
 * display-only RIGHT alone) which left the reviewer without an
 * interactive surface at narrow viewports. Threshold lowered from
 * 1280→1152 (2026-04-25) so MacBook-Pro-14" reviewers (~1252px content
 * area with the nav sidebar expanded) get dual-panel by default.
 *
 * `showPreview` — session-local toggle on the toolbar. When off AND
 * dual-panel is otherwise available, the right panel is hidden via
 * `display: none` and the left panel widens. Kept mounted so toggling
 * back on is instant (no re-render of the right panel's canvases).
 *
 * Coordinate-space binding — the detection overlay (left) and the
 * redaction-preview overlay (right) both render with percentage
 * coordinates. They sit inside an inner `width: fit-content` wrapper
 * that takes the canvas's actual rendered size, NOT the panel's
 * fixed layout width. This binds the overlay's `absolute inset-0`
 * to the canvas bounding box so percentages map to the document
 * coordinate space at every zoom level. Without this wrapper the
 * overlay's coordinate space stays at panel-width regardless of the
 * Page's `scale` prop, and boxes drift past the right edge of the
 * canvas.
 */

const DUAL_PANEL_MIN_WIDTH = 1152;
const PANEL_GAP_PX = 16;

interface DetectionForOverlay {
  id: string;
  type: string;
  text: string;
  confidence: number;
  page: number;
  position: { x: number; y: number; w: number; h: number };
  status: string;
  appliedGround?: string | null;
}

interface PdfViewerProps {
  fileUrl: string;
  detections: DetectionForOverlay[];
  selectedDetectionId: string | null;
  onDetectionClick: (detectionId: string) => void;
  detectionStates: Record<string, { status: string; appliedGround?: string | null }>;
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
  const [showPreview, setShowPreview] = useState(true);
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

  // Dual-panel only when the content area is ≥1152px wide. Below that
  // the right (redaction-preview) panel is hidden — leaving the left
  // (interactive primary view with detection overlay) at full width.
  // Design call documented in the 2026-04-24 spike: below the threshold
  // the halved panel width puts body text below readable size even on a
  // zoomed canonical, so collapsing to one panel is the right move; the
  // LEFT is the panel to keep because it's where reviewers interact
  // with detections (the right panel is display-only). Threshold
  // lowered from 1280→1152 (2026-04-25) so MacBook-Pro-14" reviewers
  // hit dual-panel by default; per-panel ≈ 568px at the threshold,
  // which holds line lengths a touch tighter than 1280→640px but is
  // still comfortably above the unreadable floor.
  const dualPanelAvailable = containerWidth >= DUAL_PANEL_MIN_WIDTH;
  const showRightPanel = dualPanelAvailable && showPreview;

  // Width math — two layers:
  //
  //   1. `basePanelWidth` — the layout-time panel width at scale=1.
  //      Splits the content area in two when dual-panel is active,
  //      takes the full width when collapsed. PANEL_GAP_PX is deducted
  //      once and split across both panels.
  //
  //   2. `leftPanelWidth` / `rightPanelWidth` — the dynamic CSS width
  //      applied to each panel `<div>`. Equals `canvasWidth + gutter`
  //      so the panel frame hugs the rendered canvas at every zoom.
  //      At scale=1 this matches basePanelWidth (base case); at
  //      scale<1 panels shrink with the document so the row's flex
  //      `justify-center` centres them in the available width
  //      instead of leaving large empty gutters inside each panel;
  //      at scale>1 panels grow with the document and overflow the
  //      row, which is the expected zoom-in behaviour and existed
  //      pre-fix.
  const basePanelWidth = useMemo(() => {
    if (containerWidth <= 0) return 0;
    if (!showRightPanel) return containerWidth;
    return Math.max(0, (containerWidth - PANEL_GAP_PX) / 2);
  }, [containerWidth, showRightPanel]);

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

  const handleToggleShowPreview = useCallback(() => {
    setShowPreview((v) => !v);
  }, []);

  // Map detections to a flat overlay-shape, then merge by exact bbox
  // (Slice B2 — fixes the doubled-translucent-fill shading bug). Both
  // overlay components receive the merged groups; the sidebar continues
  // to consume the raw `detections` prop directly so individual rows
  // remain enumerable. See `lib/review/overlay-grouping.ts` for the
  // priority rule (accepted > rejected > pending) and primary-id
  // selection logic.
  const overlays = useMemo(() => {
    const flat = detections.map((d) => {
      // In-flight reviewer state wins over the row's saved state for
      // both status and appliedGround — same priority used everywhere
      // else in this component for the status field. `appliedGround`
      // can be `null` to mean "explicitly unset" (e.g. reject clears
      // the ground), so the nullish-fallback is `??` not `||`.
      const stateRow = detectionStates[d.id];
      return {
        id: d.id,
        type: d.type,
        text: d.text,
        confidence: d.confidence,
        page: d.page,
        posX: d.position.x,
        posY: d.position.y,
        posW: d.position.w,
        posH: d.position.h,
        status: stateRow?.status ?? d.status,
        appliedGround: stateRow?.appliedGround ?? d.appliedGround ?? null,
      };
    });
    return mergeByBbox(flat);
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
  // the full container) so the panel has 12px of symmetric inner
  // margin around the canvas. The canvas itself renders at
  // `pageWidth × scale` pixels.
  const panelInnerGutter = 24;
  const leftPageWidth = basePanelWidth > 0 ? Math.max(0, basePanelWidth - panelInnerGutter) : undefined;
  const rightPageWidth = showRightPanel && basePanelWidth > 0 ? Math.max(0, basePanelWidth - panelInnerGutter) : undefined;

  // Dynamic panel width — frames the canvas tightly at every zoom.
  // Equals `pageWidth × scale + gutter`. The inner fit-content wrapper
  // inside each panel takes the canvas size exactly; mx-auto centres
  // it inside the panel for 12px symmetric margin.
  const leftPanelWidth = leftPageWidth !== undefined ? leftPageWidth * scale + panelInnerGutter : 0;
  const rightPanelWidth = rightPageWidth !== undefined ? rightPageWidth * scale + panelInnerGutter : 0;

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
        showPreview={showPreview}
        onToggleShowPreview={handleToggleShowPreview}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-100"
        data-dual-panel-active={showRightPanel ? "true" : "false"}
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
                  Always mounted; takes the full content width when the
                  right (preview) panel is hidden by responsive collapse
                  or the toolbar toggle.

                  Inner `width: fit-content` wrapper binds the overlay's
                  `absolute inset-0` to the canvas's actual rendered size
                  rather than the panel's fixed layout width. Without
                  this, overlay-button percentages drift past the canvas
                  right edge whenever scale ≠ 1 (canvas = leftPageWidth ×
                  scale; panel = leftPanelWidth — they only line up at
                  scale=1, and even then panelInnerGutter introduces a
                  small drift). `mx-auto` centres the canvas inside the
                  panel for symmetric padding. */}
              <div
                className="relative shadow-md bg-white"
                style={{ width: leftPanelWidth > 0 ? `${leftPanelWidth}px` : undefined }}
                data-panel="original"
              >
                <div className="relative mx-auto" style={{ width: "fit-content" }}>
                  <Page
                    pageNumber={pageNum}
                    scale={scale}
                    width={leftPageWidth}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                  />
                  <PdfDetectionOverlay
                    pageNumber={pageNum}
                    overlays={overlays}
                    selectedDetectionId={selectedDetectionId}
                    onDetectionClick={onDetectionClick}
                  />
                </div>
              </div>

              {/* RIGHT PANEL — canonical PDF + redaction preview
                  (display-only). Hidden via `display:none` when the
                  toolbar toggle is off OR the viewport is too narrow
                  for dual-panel; kept mounted so toggling back on is
                  instant (no canvas re-render). Same fit-content
                  wrapper rationale as the left panel.

                  `select-none` makes the right pane's pdf.js text
                  layer non-selectable. Without it, a drag-select
                  starting on this pane (or extending across pages
                  on the LEFT pane) reaches into the right pane via
                  DOM order — page rows are paired siblings under one
                  `<Document>` (L1 R1 L2 R2 …) and native browser
                  selection extends through DOM order. The right
                  pane is display-only (no manual-detection popover
                  anchored here), so making it non-selectable
                  completes the display-only contract started by
                  `aria-hidden` and `pointer-events: none`. */}
              <div
                className={`relative shadow-md bg-white select-none${showRightPanel ? "" : " hidden"}`}
                style={{ width: rightPanelWidth > 0 ? `${rightPanelWidth}px` : undefined }}
                data-panel="redacted-preview"
              >
                <div className="relative mx-auto" style={{ width: "fit-content" }}>
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
                    overlays={overlays}
                  />
                </div>
              </div>
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
