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
    // Slice B2 keys by primaryId (merged groups) instead of d.id.
    // The 2026-04-25 citation work converted the rectangle from
    // self-closing `/>` to a paired `<div>...</div>` so a citation
    // span can render inside on accepted overlays — match either form.
    const rectMatch = src.match(/key=\{merged\.primaryId\}[\s\S]*?(?:\/>|<\/div>)/);
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

  it("sets pointer-events-none on the container AND every per-status rectangle class", () => {
    const container = src.match(/className="absolute inset-0[^"]*"/);
    expect(container).not.toBeNull();
    expect(container![0]).toContain("pointer-events-none");

    // Slice-B1 follow-up: rectangles now have status-driven classes
    // (accepted = veil-redaction-black, pending = amber-500/25 +
    // border). Every non-null branch of `rightOverlayClass` must
    // include `pointer-events-none`.
    const switchBlock = src.match(/function rightOverlayClass[\s\S]*?\n\}/);
    expect(switchBlock).not.toBeNull();
    const returnLines = (switchBlock![0].match(/return\s+"[^"]*"/g) ?? []);
    expect(returnLines.length).toBeGreaterThanOrEqual(2);
    for (const ret of returnLines) {
      expect(ret).toContain("pointer-events-none");
    }
  });

  it("applies z-[3] so the overlay stacks above the pdf.js text layer (z-index 2)", () => {
    expect(src).toMatch(/z-\[3\]/);
  });

  it("renders BOTH pending and accepted rectangles; rejected returns null (Slice-B1 follow-up)", () => {
    // The rightOverlayClass switch keys: accepted → black, pending →
    // yellow translucent (matching LEFT pane), rejected → null.
    expect(src).toMatch(/case\s+"accepted":/);
    expect(src).toMatch(/case\s+"rejected":\s*\n?\s*return\s+null/);
    // Default branch covers "pending" and any unknown status, mirroring
    // PdfDetectionOverlay's default-as-pending convention.
    expect(src).toMatch(/default:\s*\n?\s*return\s+"absolute bg-amber-500\/25/);
  });

  it("filters out zero-bbox detections (posW === 0 AND posH === 0)", () => {
    // Slice B2: input is now MergedOverlay[] (overlays.posW / posH);
    // pre-Slice-B2 the field was on raw detections (d.posW / d.posH).
    expect(src).toMatch(/o\.posW > 0 \|\| o\.posH > 0/);
  });

  it("renders one element per merged-bbox group, keyed by primaryId (Slice B2 visual dedup)", () => {
    // The map iterates over `pageVisible` (already-merged groups);
    // each rendered element is keyed by the group's primary id and
    // tagged with `data-overlay-merged-count` for DOM inspection.
    expect(src).toMatch(/pageVisible\.map\(\(merged\)/);
    expect(src).toMatch(/key=\{merged\.primaryId\}/);
    expect(src).toMatch(/data-overlay-merged-count/);
  });

  it("uses the veil-redaction-black tailwind colour token for accepted (not a bare hex)", () => {
    expect(src).toMatch(/bg-veil-redaction-black/);
  });

  it("uses bg-amber-500/25 for pending — the same token PdfDetectionOverlay uses on the LEFT pane", () => {
    // Visual consistency: same yellow on both panes for the same
    // detection, so reviewer reads pending-state identically across
    // panels. Borders were dropped in the Slice-B1 follow-up.
    expect(src).toMatch(/bg-amber-500\/25/);
    expect(src).not.toMatch(/border-amber-500/);
  });

  it("positions ALL status rectangles via percentage style props with a uniform px grow (Bug 3 fix)", () => {
    // Pre-2026-04-27 the accepted branch was a special case that
    // stayed tight to the bbox, with the rationale "the redaction
    // preview must obscure only what would actually be redacted in
    // the export". Bug 3 from PR #54 verification confirmed this
    // logic was wrong: Azure DI's polygon `maxX` is the ink-bound
    // right edge of the last glyph, but the browser renders text
    // with full glyph advance — so 1-2px of the final character
    // poked out the right side of the black rectangle. The export-
    // tightness rationale only holds when the underlying text is
    // gone (PyMuPDF redaction); in the in-app preview the text is
    // still there and a tight rectangle visibly leaks the tail.
    //
    // Aligned with the LEFT pane's unconditional grow at
    // pdf-detection-overlay.tsx — both panes, all statuses, same
    // breathing room.
    expect(src).toMatch(/HIGHLIGHT_GROW_PX/);
    const styleFn = src.match(/function rightOverlayStyle[\s\S]*?\n\}/);
    expect(styleFn).not.toBeNull();
    // No more accepted special-case branch — guard against accidental
    // reintroduction of the pre-fix shape.
    expect(styleFn![0]).not.toMatch(/status === "accepted"/);
    expect(styleFn![0]).not.toMatch(/left:\s+`\$\{posX\}%`/);
    // Uniform grow expressions.
    expect(styleFn![0]).toMatch(/left:\s+`calc\(\$\{posX\}% - \$\{HIGHLIGHT_GROW_PX\}px\)`/);
    expect(styleFn![0]).toMatch(/top:\s+`calc\(\$\{posY\}% - \$\{HIGHLIGHT_GROW_PX\}px\)`/);
    expect(styleFn![0]).toMatch(/width:\s+`calc\(\$\{posW\}% \+ \$\{HIGHLIGHT_GROW_PX \* 2\}px\)`/);
    expect(styleFn![0]).toMatch(/height:\s+`calc\(\$\{posH\}% \+ \$\{HIGHLIGHT_GROW_PX \* 2\}px\)`/);
  });

  it("applies the same inset to accepted and pending rectangles (no per-status branch)", () => {
    // Regression guard: the function must produce identical CSS
    // shape for any status input, since per-status branching is
    // exactly the bug we're closing. We can't easily render the
    // component without jsdom, but a static pass over the function
    // body asserts the structural property — only one return shape,
    // shared across all statuses.
    const styleFn = src.match(/function rightOverlayStyle[\s\S]*?\n\}/);
    expect(styleFn).not.toBeNull();
    // Exactly one `return` statement in rightOverlayStyle.
    const returnCount = (styleFn![0].match(/\breturn\b/g) ?? []).length;
    expect(returnCount).toBe(1);
    // No `if (status` branches — the symptom of a per-status carve-out.
    expect(styleFn![0]).not.toMatch(/if\s*\(\s*status/);
    // HIGHLIGHT_GROW_PX must appear at least 4 times in the function
    // body (one per side: left subtract, top subtract, width add,
    // height add — width/height each multiply by 2 = 4 references
    // to the constant total).
    const growRefs = (styleFn![0].match(/HIGHLIGHT_GROW_PX/g) ?? []).length;
    expect(growRefs).toBeGreaterThanOrEqual(4);
  });

  it("HIGHLIGHT_GROW_PX is still 2 — match the LEFT pane's value", () => {
    // The LEFT pane's pdf-detection-overlay.tsx defines
    // HIGHLIGHT_GROW_PX = 2 unconditionally for all statuses. This
    // value matches that pane's; ensures the visual breathing room
    // is consistent across both panes for the same detection. If the
    // LEFT pane's value changes, this is the place to update.
    expect(src).toMatch(/const\s+HIGHLIGHT_GROW_PX\s*=\s*2\s*;/);
  });

  it("renders nothing (returns null) when the page has no visible (pending+accepted) detections", () => {
    expect(src).toMatch(/if \(pageVisible\.length === 0\) return null;/);
  });

  // Phase 12.1 (Umbra v2) — three ground-citation tests dropped.
  // The citation feature renders an LGOIMA-ground reference next to
  // accepted redactions; v2 dropped the ground vocabulary, so the
  // citation conditional is hard-wired to `false` until Phase 12.3
  // deletes the conditional entirely. The three tests below pinned
  // the import + helper call + appliedGround ?? suggestedGround
  // fallback — all gone post-rewrite. The "clips silently" test
  // below survives because overflow-hidden is still applied
  // structurally regardless of whether the citation ever renders.

  it("clips the citation silently inside narrow rectangles via overflow-hidden on the parent", () => {
    // Parent rectangle div applies overflow-hidden when status is
    // accepted; without this the white citation text could leak past
    // the right edge of a narrow black rectangle and visibly bleed
    // onto the canvas.
    const switchBlock = src.match(/function rightOverlayClass[\s\S]*?\n\}/);
    expect(switchBlock).not.toBeNull();
    const acceptedReturn = switchBlock![0].match(/case\s+"accepted":\s*\n?\s*return\s+"[^"]*"/);
    expect(acceptedReturn).not.toBeNull();
    expect(acceptedReturn![0]).toContain("overflow-hidden");
  });
});
