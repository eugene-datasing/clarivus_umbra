/**
 * Source-parse regression guard for Fix C of the
 * zero-bbox-AI-long-narrative bundle (2026-04-30): the sidebar
 * "No anchor" badge that surfaces zero-bbox detections to the
 * reviewer.
 *
 * Without this badge, a reviewer sees a row in the detections
 * sidebar, clicks it, and nothing happens — no canvas highlight,
 * no scroll-to-position. The badge tells them WHY: the page words
 * didn't match exactly, so there's no canvas anchor. Accept/reject
 * still works; the redacted export uses text-search to handle the
 * row at export time (Fix B).
 *
 * Same source-parse pattern as sidebar-keyboard.test.ts and
 * pdf-redaction-preview-overlay.test.ts — no jsdom / RTL / vite-jsx.
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

describe("review-client.tsx source — sidebar No anchor badge for zero-bbox rows (Fix C)", () => {
  const src = stripComments(readFileSync(REVIEW_PATH, "utf-8"));

  it("renders the badge only when the detection's bbox width AND height are both zero", () => {
    // Match the conditional. The badge appears next to existing source
    // badges (Manual / Rule) inside the sidebar's entity column.
    expect(src).toMatch(
      /det\.position\.w\s*===\s*0\s*&&\s*det\.position\.h\s*===\s*0/,
    );
  });

  it("uses the existing badge class with an amber palette (warning, not error)", () => {
    // Subtle visual treatment per the brief — match the existing
    // `badge bg-X-Y text-X-Y text-[9px] shrink-0` shape used by the
    // Manual and Rule badges, with an amber/yellow palette to read as
    // "advisory, not blocking".
    expect(src).toMatch(
      /className="badge bg-amber-50 text-amber-700 text-\[9px\] shrink-0"/,
    );
  });

  it("badge text reads 'No anchor' (concise, sidebar-column-friendly)", () => {
    expect(src).toMatch(/>\s*No anchor\s*</);
  });

  it("provides a hover tooltip explaining why no overlay appears and what still works", () => {
    // The reviewer needs to know: (1) why the click feels dead,
    // (2) accept/reject still works, (3) redaction is still handled
    // at export time. The title attribute carries this prose.
    const tooltipMatch = src.match(/title="[^"]*canvas anchor[^"]*"/);
    expect(tooltipMatch).not.toBeNull();
    expect(tooltipMatch![0]).toMatch(/text-search/);
    expect(tooltipMatch![0]).toMatch(/Accept\/reject still works/i);
  });

  it("provides an aria-label for screen readers (accessibility parity with the title)", () => {
    expect(src).toMatch(/aria-label="No canvas anchor[^"]*"/);
  });

  it("badge sits in the same flex row as Manual / Rule source badges (layout consistency)", () => {
    // The brief says: 'Use whatever the existing badge/icon convention
    // is in the sidebar.' The Manual and Rule badges live inside the
    // entity column's `flex items-center gap-1.5` div. The "No anchor"
    // badge lives in the same div, so the order is:
    //   text → Manual → Rule → No anchor
    // We assert the No anchor JSX appears AFTER the Rule branch in the
    // source, which reflects the in-flex render order.
    const ruleIdx = src.search(/det\.source\s*===\s*"custom-rule"/);
    const noAnchorIdx = src.search(/det\.position\.w\s*===\s*0\s*&&\s*det\.position\.h\s*===\s*0/);
    expect(ruleIdx).toBeGreaterThan(0);
    expect(noAnchorIdx).toBeGreaterThan(ruleIdx);
  });

  it("the row itself remains clickable — no bbox-gated branch around the table row's onClick / role", () => {
    // The badge is a sibling element inside the entity cell, not a
    // wrapper around the row. Accept/reject buttons in other columns
    // function regardless of bbox. We can't fully prove that here
    // without rendering, but we can guard against the obvious anti-
    // pattern: a top-level `if (det.position.w === 0)` early-return
    // around the <tr>. The badge condition appears INSIDE the entity
    // cell only — the <tr>'s onClick / role / aria are unconditional.
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*handleDetectionClick\(det\.id\)\}/);
    // No early-return / null branch keyed on zero-bbox at the row level.
    expect(src).not.toMatch(
      /det\.position\.w\s*===\s*0[\s\S]{0,40}return\s+null/,
    );
  });
});
