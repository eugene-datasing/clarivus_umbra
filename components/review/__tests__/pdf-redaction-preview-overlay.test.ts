/**
 * Slice B redaction-preview overlay — source-parse regression guard.
 *
 * Same `.test.ts` pattern as Slice A's pdf-detection-overlay test so
 * we don't have to pull in @testing-library/react, jsdom, or a jsx
 * vite plugin. Asserts the overlay is display-only, a11y-hidden, and
 * z-stacked above the text layer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PREVIEW_PATH = join(
  process.cwd(),
  "components/review/pdf-redaction-preview-overlay.tsx",
);

/**
 * Strip comments before regex asserting on source — JSDoc blocks may
 * contain `<Document>`, `<button>` etc as prose and would otherwise
 * false-positive the structural assertions.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

describe("PdfRedactionPreviewOverlay source — Slice B display-only contract", () => {
  const src = stripComments(readFileSync(PREVIEW_PATH, "utf-8"));

  it("is NOT a button — rectangles are <div>s (no click targets)", () => {
    expect(src).not.toMatch(/<button\b/);
    // Rectangles themselves; the container is a <div> which is fine.
    const rectMatch = src.match(/key=\{d\.id\}[\s\S]*?\/>/);
    expect(rectMatch).not.toBeNull();
    expect(rectMatch![0]).not.toContain("<button");
  });

  it("has no onClick / onKeyDown / onActivate handlers", () => {
    expect(src).not.toMatch(/\bonClick\s*=/);
    expect(src).not.toMatch(/\bonKeyDown\s*=/);
    expect(src).not.toMatch(/handleOverlayBoxKeyDown/);
  });

  it("sets aria-hidden on the outer container so the overlay is invisible to screen readers", () => {
    expect(src).toMatch(/aria-hidden="true"/);
  });

  it("sets pointer-events-none on both the container AND each rectangle", () => {
    const container = src.match(/className="absolute inset-0[^"]*"/);
    expect(container).not.toBeNull();
    expect(container![0]).toContain("pointer-events-none");

    const rect = src.match(/className="absolute bg-veil-redaction-black[^"]*"/);
    expect(rect).not.toBeNull();
    expect(rect![0]).toContain("pointer-events-none");
  });

  it("applies z-[3] so the overlay stacks above the pdf.js text layer (z-index 2)", () => {
    expect(src).toMatch(/z-\[3\]/);
  });

  it("filters rectangles to detections with status === 'accepted'", () => {
    expect(src).toMatch(/status === "accepted"/);
  });

  it("filters out zero-bbox detections (posW === 0 AND posH === 0)", () => {
    expect(src).toMatch(/d\.posW > 0 \|\| d\.posH > 0/);
  });

  it("uses the veil-redaction-black tailwind colour token (not a bare hex)", () => {
    expect(src).toMatch(/bg-veil-redaction-black/);
  });

  it("positions rectangles via percentage style props (posX/posY/posW/posH)", () => {
    expect(src).toMatch(/left:\s*`\$\{d\.posX\}%`/);
    expect(src).toMatch(/top:\s*`\$\{d\.posY\}%`/);
    expect(src).toMatch(/width:\s*`\$\{d\.posW\}%`/);
    expect(src).toMatch(/height:\s*`\$\{d\.posH\}%`/);
  });

  it("renders nothing (returns null) when the page has no accepted detections", () => {
    expect(src).toMatch(/if \(pageAccepted\.length === 0\) return null;/);
  });
});
