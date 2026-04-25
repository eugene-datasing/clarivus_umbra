/**
 * Source-parse regression guard for the Slice B2 popover state-sync
 * fix. The original bug: `useState(selectedText)` only consumes its
 * argument on first mount, so subsequent prop updates (each Shift+
 * Arrow keyup re-fires `setManualPopover` in the parent) were ignored
 * and the textarea stayed stale.
 *
 * Same `.test.ts` source-parse pattern as Slice A's overlay tests so
 * we don't have to pull in @testing-library/react + jsdom + a jsx
 * vite plugin for what amounts to verifying a few code-shape
 * invariants.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const POPOVER_PATH = join(
  process.cwd(),
  "components/review/manual-detection-popover.tsx",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("ManualDetectionPopover source — Slice B2 prop-sync contract", () => {
  const src = stripComments(readFileSync(POPOVER_PATH, "utf-8"));

  it("imports useEffect and useRef alongside useState", () => {
    expect(src).toMatch(/import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*"react"/);
    expect(src).toMatch(/import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*"react"/);
    expect(src).toMatch(/import\s*\{[^}]*\buseState\b[^}]*\}\s*from\s*"react"/);
  });

  it("tracks user-edit state via a ref (not state) so it doesn't trigger re-render", () => {
    // userEditedTextRef = useRef(false). Refs avoid state-update
    // re-renders that a useState boolean would cause every time the
    // textarea onChange fires.
    expect(src).toMatch(/userEditedTextRef\s*=\s*useRef\(false\)/);
  });

  it("tracks last position via a ref for the fresh-selection-delta heuristic", () => {
    expect(src).toMatch(/lastPositionRef\s*=\s*useRef\(position\)/);
  });

  it("syncs selectedText -> textarea via useEffect with [selectedText, position] deps", () => {
    // The dependency array must include both selectedText (the prop
    // that updates per keyup) and position (used to detect fresh
    // selection). It must NOT depend on text/userEditedTextRef
    // because those would either cause a sync loop or have no
    // re-render effect (refs).
    expect(src).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[selectedText,\s*position\]\)/);
  });

  it("textarea onChange flips the user-edited flag on the ref AND updates the local text state", () => {
    const onChange = src.match(/onChange=\{\(e\)\s*=>\s*\{[\s\S]*?\}\}/);
    expect(onChange).not.toBeNull();
    expect(onChange![0]).toMatch(/setText\(e\.target\.value\)/);
    expect(onChange![0]).toMatch(/userEditedTextRef\.current\s*=\s*true/);
  });

  it("resets the edit flag on a fresh-selection (large position jump)", () => {
    // The useEffect's "fresh selection" branch must:
    //   1. clear userEditedTextRef.current
    //   2. setText(selectedText) unconditionally
    // The threshold is a constant (FRESH_SELECTION_DELTA_PX) so it's
    // tunable in one place.
    expect(src).toMatch(/FRESH_SELECTION_DELTA_PX/);
    expect(src).toMatch(/userEditedTextRef\.current\s*=\s*false/);
    // Reset path setText must follow the flag clear inside the
    // useEffect — the source-parse can confirm both lines exist.
    expect(src).toMatch(/setText\(selectedText\)/);
  });

  it("preserves user edits when selection extends by a small delta (no fresh-selection trigger)", () => {
    // The non-fresh-selection branch must respect userEditedTextRef:
    // when the flag is set, no setText(selectedText) call should
    // fire. The conditional `if (!userEditedTextRef.current)` guards
    // this branch.
    expect(src).toMatch(/if\s*\(!userEditedTextRef\.current\)\s*\{[\s\S]*?setText\(selectedText\)/);
  });
});
