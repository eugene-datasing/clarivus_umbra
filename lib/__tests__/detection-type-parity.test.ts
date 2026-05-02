/**
 * Phase 5 parity test — detection-type vocabulary lockdown.
 *
 * Every plumbing point that emits or routes detections must reference
 * the same canonical type set. The canonical source is
 * `DEFAULT_GROUND_FOR_TYPE` in `lib/detection-type-grounds.ts` (22 keys
 * post-Phase-5). This test fails if any plumbing point introduces a
 * type the canonical map doesn't know about — preventing the silent
 * drift that survey Q3/Q10 flagged (a renamed type silently wrong-
 * routes through one detector and not another).
 *
 * Plumbing points checked:
 *   - DETECTION_TYPE_MAP — UI label → type bindings.
 *   - DEFAULT_DETECTION_TOGGLES — admin toggle list.
 *   - PATTERNS[].type — every regex detector emit.
 *   - LABEL_DICTIONARY[].type — every label-adjacent detector emit.
 *   - ALL_AI_TYPES — every AI-emit type the prompt builder enumerates.
 *   - TYPE_TO_PATHWAY — bench scorer routing map.
 *
 * If a new detection type lands, add it to DEFAULT_GROUND_FOR_TYPE
 * first; this test will then pass when the new type is wired up
 * everywhere else.
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_GROUND_FOR_TYPE } from "../detection-type-grounds";
import { DEFAULT_DETECTION_TOGGLES, DETECTION_TYPE_MAP } from "../data/settings";
import { ALL_AI_TYPES } from "../pipeline/ai-detect";
import { TYPE_TO_PATHWAY } from "../bench/pathways";

const CANONICAL_TYPES = new Set(Object.keys(DEFAULT_GROUND_FOR_TYPE));

describe("detection-type vocabulary parity (Phase 5 lockdown)", () => {
  it("canonical map has 22 entries (the locked Umbra v1 vocabulary)", () => {
    expect(CANONICAL_TYPES.size).toBe(22);
  });

  it("includes nz-driver-licence (post-Phase-5 rename)", () => {
    expect(CANONICAL_TYPES.has("nz-driver-licence")).toBe(true);
    expect(CANONICAL_TYPES.has("driver-licence")).toBe(false);
  });

  it("DETECTION_TYPE_MAP only emits canonical types", () => {
    for (const [label, type] of Object.entries(DETECTION_TYPE_MAP)) {
      expect(CANONICAL_TYPES.has(type), `label "${label}" → unknown type "${type}"`).toBe(true);
    }
  });

  it("DEFAULT_DETECTION_TOGGLES only emits canonical types", () => {
    for (const toggle of DEFAULT_DETECTION_TOGGLES) {
      const type = DETECTION_TYPE_MAP[toggle.label];
      if (type) {
        expect(CANONICAL_TYPES.has(type), `toggle "${toggle.label}" → unknown type "${type}"`).toBe(true);
      }
    }
  });

  it("ALL_AI_TYPES is a subset of canonical types", () => {
    for (const type of ALL_AI_TYPES) {
      expect(CANONICAL_TYPES.has(type), `ALL_AI_TYPES has unknown type "${type}"`).toBe(true);
    }
  });

  it("TYPE_TO_PATHWAY only routes canonical types", () => {
    for (const type of Object.keys(TYPE_TO_PATHWAY)) {
      expect(CANONICAL_TYPES.has(type), `TYPE_TO_PATHWAY has unknown type "${type}"`).toBe(true);
    }
  });

  it("PATTERNS array emits only canonical types", async () => {
    // Dynamic import to avoid pulling the full pipeline graph at module load.
    const patternsMod = await import("../pipeline/patterns");
    const detected = patternsMod.detectPatterns([
      {
        pageNumber: 1,
        text: [
          "Bank account: 12-3456-7890123-00",
          "IRD: 12-345-678",
          "Mobile: 021 544 908",
          "Email: test@example.com",
          "NHI: ABC1234",
          "Address: 12 Tui Street",
          "Driver licence number HM847219",
          "Passport AB123456",
          "Plate ABC123",
        ].join("\n"),
        words: [],
      },
    ]);
    for (const m of detected) {
      expect(CANONICAL_TYPES.has(m.type), `pattern emitted unknown type "${m.type}"`).toBe(true);
    }
  });

  it("label-adjacent detector emits only canonical types", async () => {
    const labelMod = await import("../pipeline/label-adjacent");
    const detected = labelMod.detectLabelAdjacent([
      {
        pageNumber: 1,
        text: [
          "Date of birth: 14 June 1983",
          "Address: 12 Tui Street",
          "Phone: 021 544 908",
          "Email: test@example.com",
          "IRD: 12-345-678",
          "NHI: ABC1234",
          "NZ Passport: AB123456",
          "Driver licence: HM847219",
          "Bank account: 12-3456-7890123-00",
          "Number plate: ABC123",
          "Employee number: EMP-0001",
          "Salary: $100,000",
          "GP: Dr Smith",
          "ICD-10: F32.0",
        ].join("\n"),
        words: [],
      },
    ]);
    for (const m of detected) {
      expect(CANONICAL_TYPES.has(m.type), `label-adjacent emitted unknown type "${m.type}"`).toBe(true);
    }
  });
});
