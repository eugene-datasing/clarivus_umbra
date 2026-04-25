/**
 * Slice A a11y regression tests for the PDF detection overlay.
 *
 * Two layers of coverage:
 *
 *   1. Pure unit test for the `handleOverlayBoxKeyDown` helper (imported
 *      from the plain `.ts` module, not the `.tsx` component, so the
 *      vitest default pipeline doesn't have to transform JSX).
 *
 *   2. Source-parse regex assertions on `pdf-detection-overlay.tsx` —
 *      confirms the rendered tree uses `<button`, `role="button"`,
 *      `type="button"`, `aria-label=...`, `aria-pressed`, `tabIndex={0}`,
 *      and the `z-[3]` container. This avoids adding @testing-library/react
 *      + jsdom + a jsx vite plugin just for one a11y contract.
 *
 * Layer 1 gives us the runtime keyboard-activation behaviour; layer 2
 * catches regressions in the component's rendered markup without a DOM.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleOverlayBoxKeyDown } from "../overlay-key-handler";

const OVERLAY_PATH = join(process.cwd(), "components/review/pdf-detection-overlay.tsx");

describe("handleOverlayBoxKeyDown", () => {
  it("activates on Enter", () => {
    let called = 0;
    const result = handleOverlayBoxKeyDown("Enter", () => { called++; });
    expect(called).toBe(1);
    expect(result).toBe(true);
  });

  it("activates on Space (single char)", () => {
    let called = 0;
    const result = handleOverlayBoxKeyDown(" ", () => { called++; });
    expect(called).toBe(1);
    expect(result).toBe(true);
  });

  it("activates on Spacebar (legacy key name from some screen readers)", () => {
    let called = 0;
    const result = handleOverlayBoxKeyDown("Spacebar", () => { called++; });
    expect(called).toBe(1);
    expect(result).toBe(true);
  });

  it("does not activate on other keys", () => {
    let called = 0;
    for (const key of ["Tab", "Escape", "ArrowDown", "a", "1"]) {
      const result = handleOverlayBoxKeyDown(key, () => { called++; });
      expect(result).toBe(false);
    }
    expect(called).toBe(0);
  });
});

describe("PdfDetectionOverlay source — a11y structural shape", () => {
  const src = readFileSync(OVERLAY_PATH, "utf-8");

  it("renders overlay boxes as <button> elements (not <div>)", () => {
    expect(src).toMatch(/<button[\s\n]/);
    // Confirm no rogue <div ... onClick pattern at the box level.
    // The container remains a <div> but should never have onClick.
    const divWithOnClick = src.match(/<div[^>]*\bonClick\s*=/);
    expect(divWithOnClick).toBeNull();
  });

  it("sets role=\"button\" for explicit semantic clarity", () => {
    expect(src).toMatch(/role="button"/);
  });

  it("sets type=\"button\" so it never submits ambient forms", () => {
    expect(src).toMatch(/type="button"/);
  });

  it("sets aria-label to `<types>: <text>` — joining all types in a merged group (Slice B2)", () => {
    // Slice B2: when overlapping detections at the same bbox are
    // merged into one group, the ARIA label lists every distinct
    // type joined by ", " — e.g. "phone, bank-account: 12-3056-…".
    // For a single-detection group the label collapses to the same
    // shape as pre-merge ("phone: 021 544 908").
    expect(src).toMatch(/const\s+ariaLabel\s*=\s*`\$\{merged\.types\.join\(", "\)\}: \$\{merged\.text\}`/);
    expect(src).toMatch(/aria-label=\{ariaLabel\}/);
  });

  it("sets aria-pressed to the selected-state boolean", () => {
    expect(src).toMatch(/aria-pressed=\{isSelected\}/);
  });

  it("sets tabIndex={0} so boxes enter the keyboard tab order", () => {
    expect(src).toMatch(/tabIndex=\{0\}/);
  });

  it("applies z-[3] to the overlay container (above pdf.js text layer z-index 2)", () => {
    expect(src).toMatch(/z-\[3\]/);
  });

  it("onKeyDown handler delegates to handleOverlayBoxKeyDown", () => {
    expect(src).toMatch(/handleOverlayBoxKeyDown\(\s*e\.key/);
  });

  it("container keeps pointer-events-none; boxes keep pointer-events-auto", () => {
    expect(src).toMatch(/pointer-events-none/);
    expect(src).toMatch(/pointer-events-auto/);
  });

  it("preserves percentage positioning, with a small px grow for visual breathing room", () => {
    // Slice-B1 follow-up: each highlight grows past the glyph bbox by
    // a constant pixel value (HIGHLIGHT_GROW_PX) on each side. The
    // percentage-driven anchor stays in calc() so the position scales
    // with the canvas's rendered size. Slice B2 also passes
    // merged.posX/posY/posW/posH via a `highlightStyle()` helper.
    expect(src).toMatch(/HIGHLIGHT_GROW_PX/);
    expect(src).toMatch(/left:\s+`calc\(\$\{posX\}% - \$\{HIGHLIGHT_GROW_PX\}px\)`/);
    expect(src).toMatch(/top:\s+`calc\(\$\{posY\}% - \$\{HIGHLIGHT_GROW_PX\}px\)`/);
    expect(src).toMatch(/width:\s+`calc\(\$\{posW\}% \+ \$\{HIGHLIGHT_GROW_PX \* 2\}px\)`/);
    expect(src).toMatch(/height:\s+`calc\(\$\{posH\}% \+ \$\{HIGHLIGHT_GROW_PX \* 2\}px\)`/);
    expect(src).toMatch(/highlightStyle\(merged\.posX, merged\.posY, merged\.posW, merged\.posH\)/);
  });

  it("renders one button per merged-bbox group, keyed by primaryId (Slice B2 visual dedup)", () => {
    // The map iterates over `pageOverlays` (already-merged groups),
    // not raw detections. Click targets the primary id; selection
    // membership uses detectionIds.includes(...) so non-primary
    // sidebar selections still highlight the merged overlay.
    expect(src).toMatch(/pageOverlays\.map\(\(merged\)/);
    expect(src).toMatch(/key=\{merged\.primaryId\}/);
    expect(src).toMatch(/onDetectionClick\(merged\.primaryId\)/);
    expect(src).toMatch(/merged\.detectionIds\.includes\(selectedDetectionId\)/);
  });

  it("status-driven className composes only the fill (no border) — Slice-B1 follow-up", () => {
    // Borders were dropped on the LEFT pane in the Slice-B1 colour-
    // scheme work; the fill alone is sufficient signal and the border
    // was competing with the underlying text. Matches the RIGHT pane.
    const statusFn = src.match(/function statusColor[\s\S]*?\n\}/);
    expect(statusFn).not.toBeNull();
    expect(statusFn![0]).not.toMatch(/border-2/);
    expect(statusFn![0]).not.toMatch(/border-(amber|red|emerald)-/);
    // Each branch still returns a /25 fill colour.
    expect(statusFn![0]).toMatch(/bg-amber-500\/25/);
    expect(statusFn![0]).toMatch(/bg-red-500\/25/);
    expect(statusFn![0]).toMatch(/bg-emerald-500\/25/);
  });
});
