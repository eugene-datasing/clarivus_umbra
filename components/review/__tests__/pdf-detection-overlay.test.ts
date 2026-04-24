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

  it("sets aria-label to `<type>: <text>` via a template literal", () => {
    expect(src).toMatch(/aria-label=\{`\$\{det\.type\}: \$\{det\.text\}`\}/);
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

  it("preserves percentage positioning via style.left/top/width/height", () => {
    expect(src).toMatch(/left:\s*`\$\{det\.posX\}%`/);
    expect(src).toMatch(/top:\s*`\$\{det\.posY\}%`/);
    expect(src).toMatch(/width:\s*`\$\{det\.posW\}%`/);
    expect(src).toMatch(/height:\s*`\$\{det\.posH\}%`/);
  });
});
