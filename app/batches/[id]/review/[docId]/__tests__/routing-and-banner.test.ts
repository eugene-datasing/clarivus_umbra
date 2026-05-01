/**
 * Slice C source-parse tests for review-client.tsx:
 *   - the three-way routing gate on `canonicalPdfTextSelectable`;
 *   - the Option C banner's rendering condition + copy + ARIA.
 *
 * Same `.test.ts` + `readFileSync` pattern as Slice A/B — avoids
 * pulling in jsdom / @testing-library just to verify a few invariants
 * on a 2,200-line component file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT_PATH = join(
  process.cwd(),
  "app/requests/[id]/review/[docId]/review-client.tsx",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("Slice C routing gate — review-client source", () => {
  const src = stripComments(readFileSync(CLIENT_PATH, "utf-8"));

  it("showPdf requires flag=pdf AND canonical path AND text-selectable !== false", () => {
    expect(src).toMatch(/const\s+showPdf\s*=\s*\n?\s*viewerMode\s*===\s*"pdf"/);
    expect(src).toMatch(/!!canonicalPdfPath/);
    expect(src).toMatch(/canonicalPdfTextSelectable\s*!==\s*false/);
  });

  it("showOptionCBanner triggers ONLY when text-selectable === false (not null)", () => {
    // Strict equality — null values must not route to the banner.
    expect(src).toMatch(
      /const\s+showOptionCBanner\s*=\s*\n?\s*viewerMode\s*===\s*"pdf"[\s\S]*?canonicalPdfTextSelectable\s*===\s*false/,
    );
  });

  it("banner renders with role='status' and aria-live='polite'", () => {
    expect(src).toMatch(/showOptionCBanner\s*&&\s*\(/);
    expect(src).toMatch(/role="status"/);
    expect(src).toMatch(/aria-live="polite"/);
  });

  it("banner copy matches the Slice C scope spec", () => {
    expect(src).toMatch(
      /This document doesn(&apos;|['’])t have selectable text \(scanned or image-only\)\./,
    );
    expect(src).toMatch(
      /Showing the reconstructed text view so you can still select and annotate text\./,
    );
  });

  it("banner has a data-option-c-banner marker so the verification script can assert presence", () => {
    expect(src).toMatch(/data-option-c-banner="true"/);
  });

  it("HTML handler retains its onMouseUp-only behaviour (parity, not regression)", () => {
    // The HTML right-panel uses onMouseUp={handleTextSelection} — no keyup.
    expect(src).toMatch(/onMouseUp=\{handleTextSelection\}/);
    // No keyup handler on the same panel wrapper.
    const htmlBlock = src.match(/onMouseUp=\{handleTextSelection\}[\s\S]{0,400}/);
    expect(htmlBlock).not.toBeNull();
    expect(htmlBlock![0]).not.toMatch(/onKeyUp=/);
  });

  it("PDF handler plumbs to PdfViewer via onTextSelection prop", () => {
    expect(src).toMatch(/onTextSelection=\{handlePdfTextSelection\}/);
  });

  it("handlePdfTextSelection delegates to the pure helper from lib/review/pdf-selection", () => {
    expect(src).toMatch(/import\s+\{[^}]*computePdfSelectionBbox[^}]*\}\s+from\s+"@\/lib\/review\/pdf-selection"/);
    expect(src).toMatch(/import\s+\{[^}]*findPdfPageWrapper[^}]*\}\s+from\s+"@\/lib\/review\/pdf-selection"/);
    expect(src).toMatch(/computePdfSelectionBbox\(/);
    expect(src).toMatch(/findPdfPageWrapper\(/);
  });
});
