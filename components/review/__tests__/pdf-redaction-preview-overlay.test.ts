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

  it("positions rectangles via percentage style props with a px grow for pending; tight for accepted", () => {
    // Pending and rejected branches grow by HIGHLIGHT_GROW_PX on each
    // side (visual breathing room around the glyph). Accepted stays
    // tight to the bbox so the redaction preview obscures only what
    // would actually be redacted in the export.
    expect(src).toMatch(/HIGHLIGHT_GROW_PX/);
    const styleFn = src.match(/function rightOverlayStyle[\s\S]*?\n\}/);
    expect(styleFn).not.toBeNull();
    // accepted branch: tight
    expect(styleFn![0]).toMatch(/status === "accepted"/);
    expect(styleFn![0]).toMatch(/left:\s+`\$\{posX\}%`/);
    expect(styleFn![0]).toMatch(/width:\s+`\$\{posW\}%`/);
    // grown branch (default — pending)
    expect(styleFn![0]).toMatch(/left:\s+`calc\(\$\{posX\}% - \$\{HIGHLIGHT_GROW_PX\}px\)`/);
    expect(styleFn![0]).toMatch(/width:\s+`calc\(\$\{posW\}% \+ \$\{HIGHLIGHT_GROW_PX \* 2\}px\)`/);
  });

  it("renders nothing (returns null) when the page has no visible (pending+accepted) detections", () => {
    expect(src).toMatch(/if \(pageVisible\.length === 0\) return null;/);
  });

  it("renders a ground citation span on accepted overlays only (post-2026-04-25 dual-panel-ux PR)", () => {
    // The citation is conditional on `accepted` AND a non-null
    // appliedGround — pending and rejected don't get the label, and
    // accepted-without-ground (legacy / manual annotations) also
    // skip it.
    expect(src).toMatch(/merged\.status === "accepted"[\s\S]*?merged\.appliedGround/);
    // The span itself uses the exact Tailwind classes Eugene specced:
    // top-right anchored, white-on-black, 7px font-mono.
    expect(src).toMatch(/right-0\.5/);
    expect(src).toMatch(/top-0/);
    expect(src).toMatch(/text-\[7px\]/);
    expect(src).toMatch(/font-mono/);
    expect(src).toMatch(/text-white\/85/);
    // pointer-events-none + select-none + whitespace-nowrap so the
    // citation neither blocks clicks nor selects with the canvas
    // text and never wraps onto a second line inside the rectangle.
    expect(src).toMatch(/pointer-events-none/);
    expect(src).toMatch(/select-none/);
    expect(src).toMatch(/whitespace-nowrap/);
    // data-attr for e2e / DOM-inspection grep.
    expect(src).toMatch(/data-redaction-citation="true"/);
  });

  it("formats the citation via the shared groundLabel helper, not a local copy", () => {
    // groundLabel is defined in `lib/lgoima-grounds.ts` and shared
    // with the sidebar's accepted-row footer in review-client.tsx —
    // both surfaces format applied-ground identically.
    expect(src).toMatch(/import\s*\{\s*groundLabel\s*\}\s*from\s*"@\/lib\/lgoima-grounds"/);
    expect(src).toMatch(/groundLabel\(merged\.appliedGround\)/);
  });

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
