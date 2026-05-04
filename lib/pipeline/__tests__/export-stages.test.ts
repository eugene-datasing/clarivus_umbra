/**
 * Phase 12.6b — assert the export pipeline's well-known checkpoint
 * list stays in sync with the labels emitted by `doGenerate` in
 * `lib/pipeline/export.ts`. This guards against:
 *
 *   1. A checkpoint being silently removed from `doGenerate` while
 *      the constant still advertises it (UI step-meter would stall).
 *   2. The ordering being scrambled (UI maps labels to a fraction of
 *      the bar in declared order).
 *
 * The assertion reads the source file as text and checks each stage
 * label appears as a `currentStep:` literal, in the same order. This
 * is brittle by design: any drift trips the test loudly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { EXPORT_STAGE_LABELS } from "../export";

const exportSource = readFileSync(
  resolve(process.cwd(), "lib/pipeline/export.ts"),
  "utf-8",
);

describe("EXPORT_STAGE_LABELS", () => {
  it("includes the Phase 12.6b 'Uploading to storage' checkpoint", () => {
    expect(EXPORT_STAGE_LABELS).toContain("Uploading to storage");
  });

  it("orders 'Uploading to storage' between integrity hash and completion", () => {
    const order = [...EXPORT_STAGE_LABELS];
    const hashIdx = order.indexOf("Computing integrity hash");
    const uploadIdx = order.indexOf("Uploading to storage");
    const completeIdx = order.indexOf("Export complete");
    expect(hashIdx).toBeGreaterThanOrEqual(0);
    expect(uploadIdx).toBeGreaterThan(hashIdx);
    expect(completeIdx).toBeGreaterThan(uploadIdx);
  });

  it("every declared stage label appears in the export.ts source as a currentStep emission", () => {
    for (const label of EXPORT_STAGE_LABELS) {
      const literal = `currentStep: "${label}"`;
      expect(
        exportSource.includes(literal),
        `expected export.ts to emit currentStep="${label}"`,
      ).toBe(true);
    }
  });

  it("source emits stage labels in the same order as the constant declares", () => {
    const indices = EXPORT_STAGE_LABELS.map((label) =>
      exportSource.indexOf(`currentStep: "${label}"`),
    );
    for (let i = 1; i < indices.length; i++) {
      expect(
        indices[i],
        `expected "${EXPORT_STAGE_LABELS[i]}" to appear after "${EXPORT_STAGE_LABELS[i - 1]}" in source`,
      ).toBeGreaterThan(indices[i - 1]);
    }
  });
});
