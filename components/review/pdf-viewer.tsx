"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import PdfDetectionOverlay from "./pdf-detection-overlay";
import PdfToolbar from "./pdf-toolbar";

// Same-origin worker — copied into public/ by scripts/copy-pdfjs-worker.ts
// (postinstall). Third-party CDN removed for data-sovereignty + CSP.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

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
}

export default function PdfViewer({
  fileUrl,
  detections,
  selectedDetectionId,
  onDetectionClick,
  detectionStates,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Measure container width for fit-to-width calculation
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

  // Track visible page via IntersectionObserver
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

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(3, s + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(0.5, s - 0.25));
  }, []);

  const handleFitWidth = useCallback(() => {
    setScale(1);
  }, []);

  // Map detections to overlay format with current status
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

  // Scroll to a specific page when a detection is selected
  useEffect(() => {
    if (!selectedDetectionId) return;
    const det = detections.find((d) => d.id === selectedDetectionId);
    if (!det) return;
    const pageEl = pageRefs.current[det.page];
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedDetectionId, detections]);

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
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-100"
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
              className="relative mx-auto mb-4 shadow-md"
              style={{ width: "fit-content" }}
            >
              <Page
                pageNumber={pageNum}
                scale={scale}
                width={containerWidth > 0 ? containerWidth - 48 : undefined}
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
          ))}
        </Document>
      </div>
    </div>
  );
}
