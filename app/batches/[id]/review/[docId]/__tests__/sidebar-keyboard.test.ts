/**
 * Source-parse regression guard for the Slice B2 sidebar-keyboard fix.
 *
 * Original bug: the global window-level keydown listener in
 * review-client.tsx handled `ArrowDown` / `ArrowUp` unconditionally,
 * calling `e.preventDefault()` and advancing the sidebar selection.
 * That cancelled the browser's Shift+Arrow text-selection extension
 * when the user was keyboard-selecting on the PDF.
 *
 * Fix: short-circuit ArrowDown/ArrowUp when `e.shiftKey` is true,
 * yielding to the browser's default selection-extension behaviour.
 * Plain ArrowDown / ArrowUp (no Shift) still advances the sidebar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REVIEW_PATH = join(
  process.cwd(),
  "app/batches/[id]/review/[docId]/review-client.tsx",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("review-client.tsx source — sidebar keyboard handler (Slice B2)", () => {
  const src = stripComments(readFileSync(REVIEW_PATH, "utf-8"));

  it("ArrowDown handler short-circuits when Shift is held (selection-extension)", () => {
    // Capture the ArrowDown case body — from `case "ArrowDown":` to
    // the next `case "` or the closing `}`.
    const arrowDownBlock = src.match(/case "ArrowDown":\s*\{[\s\S]*?break;\s*\}/);
    expect(arrowDownBlock).not.toBeNull();
    expect(arrowDownBlock![0]).toMatch(/if\s*\(\s*e\.shiftKey\s*\)\s*return\s*;/);
  });

  it("ArrowUp handler short-circuits when Shift is held (selection-extension)", () => {
    const arrowUpBlock = src.match(/case "ArrowUp":\s*\{[\s\S]*?break;\s*\}/);
    expect(arrowUpBlock).not.toBeNull();
    expect(arrowUpBlock![0]).toMatch(/if\s*\(\s*e\.shiftKey\s*\)\s*return\s*;/);
  });

  it("the Shift-key short-circuit appears BEFORE preventDefault — preserves browser default", () => {
    // The short-circuit must be the first statement so
    // `e.preventDefault()` can't fire on Shift+Arrow. Source order
    // matters here because `preventDefault` cancels the browser's
    // built-in selection-extension.
    const arrowDownBlock = src.match(/case "ArrowDown":\s*\{[\s\S]*?break;\s*\}/);
    expect(arrowDownBlock).not.toBeNull();
    const shiftIdx = arrowDownBlock![0].indexOf("e.shiftKey");
    const preventIdx = arrowDownBlock![0].indexOf("e.preventDefault()");
    expect(shiftIdx).toBeGreaterThan(0);
    expect(preventIdx).toBeGreaterThan(shiftIdx);
  });
});
