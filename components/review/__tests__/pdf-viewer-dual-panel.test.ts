/**
 * Slice B PdfViewer dual-panel regression guard (source-parse).
 *
 * Confirms the single-Document-paired-Pages architecture from the
 * 2026-04-24 spike recommendation and the responsive-collapse +
 * showPreview plumbing required by Slice B (showPreview was the post-
 * Slice-B1-fix renaming of the original showOriginal flag, after the
 * collapse direction was inverted to keep the LEFT/interactive panel
 * at narrow viewports rather than the RIGHT/preview panel).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VIEWER_PATH = join(process.cwd(), "components/review/pdf-viewer.tsx");

/**
 * Strip comments before regex asserting — JSDoc contains phrases like
 * `single <Document> instance` and `two <Page> instances` that would
 * false-positive the structural tag counts.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("PdfViewer source — Slice B dual-panel contract", () => {
  const src = stripComments(readFileSync(VIEWER_PATH, "utf-8"));

  it("imports PdfRedactionPreviewOverlay alongside PdfDetectionOverlay", () => {
    expect(src).toMatch(/import\s+PdfDetectionOverlay\s+from\s+"\.\/pdf-detection-overlay"/);
    expect(src).toMatch(/import\s+PdfRedactionPreviewOverlay\s+from\s+"\.\/pdf-redaction-preview-overlay"/);
  });

  it("keeps a single <Document> instance (NOT two) — the spike recommendation", () => {
    // Count JSX opening tags for <Document (tolerant of attribute layout).
    const docOpens = src.match(/<Document\b/g) ?? [];
    expect(docOpens.length).toBe(1);
  });

  it("renders exactly two <Page> instances per page (one per panel)", () => {
    const pageOpens = src.match(/<Page\b/g) ?? [];
    expect(pageOpens.length).toBe(2);
  });

  it("defines DUAL_PANEL_MIN_WIDTH as 1280 and uses it to gate dual-panel", () => {
    expect(src).toMatch(/const\s+DUAL_PANEL_MIN_WIDTH\s*=\s*1280/);
    expect(src).toMatch(/containerWidth\s*>=\s*DUAL_PANEL_MIN_WIDTH/);
  });

  it("hides the right (preview) panel via CSS 'hidden' rather than unmounting it", () => {
    // Preserves canvas state so toggling showPreview back on is instant.
    // The narrow-viewport collapse and the toolbar toggle both route
    // through showRightPanel, so this assertion covers both paths.
    expect(src).toMatch(/showRightPanel\s*\?\s*""\s*:\s*" hidden"/);
  });

  it("passes showPreview + onToggleShowPreview + dualPanelAvailable to the toolbar", () => {
    expect(src).toMatch(/dualPanelAvailable=\{dualPanelAvailable\}/);
    expect(src).toMatch(/showPreview=\{showPreview\}/);
    expect(src).toMatch(/onToggleShowPreview=\{handleToggleShowPreview\}/);
  });

  it("wraps each <Page>+overlay pair in an inner fit-content container", () => {
    // Binds the overlay's `absolute inset-0` to the canvas's actual
    // rendered size rather than the panel's fixed layout width, so
    // overlay percentages map to the document at every zoom level.
    const fitContentWrappers = src.match(/width:\s*"fit-content"/g) ?? [];
    expect(fitContentWrappers.length).toBe(2);
  });

  it("targets IntersectionObserver at the per-page wrapper (one element per page)", () => {
    // data-page-number is on the flex-row wrapper, NOT on the inner
    // panel divs — otherwise current-page tracking would double-count
    // under dual-panel.
    const wrapperWithPageNum = src.match(/data-page-number=\{pageNum\}[^<>]*(?!panel)/);
    expect(wrapperWithPageNum).not.toBeNull();
    // Confirm the inner panel divs have data-panel, not data-page-number.
    expect(src).toMatch(/data-panel="original"/);
    expect(src).toMatch(/data-panel="redacted-preview"/);
  });

  it("aria-hides the right-panel canvas so screen readers don't announce the document twice", () => {
    expect(src).toMatch(/canvasRef=\{\(c\)[\s\S]*?aria-hidden[\s\S]*?\}/);
  });

  it("scrolls the per-page wrapper on selected-detection change (both panels follow together)", () => {
    expect(src).toMatch(/pageRefs\.current\[det\.page\]/);
    expect(src).toMatch(/scrollIntoView/);
  });

  it("preserves same-origin worker URL from Slice A", () => {
    expect(src).toMatch(/workerSrc\s*=\s*"\/pdf\.worker\.min\.mjs"/);
  });

  it("keeps renderTextLayer={true} on both panels (not one or the other)", () => {
    const matches = src.match(/renderTextLayer=\{true\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the left detection overlay for interactive clicks", () => {
    // The interactive overlay with selectedDetectionId + onDetectionClick
    // must sit on the LEFT panel, not the right.
    const leftPanelBlock = src.match(
      /data-panel="original"[\s\S]*?data-panel="redacted-preview"/,
    );
    expect(leftPanelBlock).not.toBeNull();
    expect(leftPanelBlock![0]).toContain("PdfDetectionOverlay");
    expect(leftPanelBlock![0]).toContain("onDetectionClick");
    // The right panel (the block from redacted-preview onward) uses
    // PdfRedactionPreviewOverlay and NOT PdfDetectionOverlay.
    const rightPanelBlock = src.slice(src.indexOf('data-panel="redacted-preview"'));
    expect(rightPanelBlock).toContain("PdfRedactionPreviewOverlay");
    expect(rightPanelBlock).not.toContain("PdfDetectionOverlay");
  });
});
