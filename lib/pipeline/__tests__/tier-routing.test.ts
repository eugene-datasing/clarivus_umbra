/**
 * Phase 12.2 — tier-routing unit tests.
 */
import { describe, it, expect } from "vitest";
import { bucketConfidence, tierToStatus, type Tier } from "../tier-routing";
import { DEFAULT_AUTO_REDACT_CONFIG } from "@/lib/data/settings";

const cfg = DEFAULT_AUTO_REDACT_CONFIG;

describe("bucketConfidence — deterministic sources always high", () => {
  for (const source of ["pattern", "label-adjacent", "custom-rule", "manual"]) {
    it(`${source} at confidence 0 → high`, () => {
      expect(bucketConfidence({ source, confidence: 0 }, cfg)).toBe("high");
    });
    it(`${source} at confidence 50 → high`, () => {
      expect(bucketConfidence({ source, confidence: 50 }, cfg)).toBe("high");
    });
    it(`${source} at confidence 95 → high`, () => {
      expect(bucketConfidence({ source, confidence: 95 }, cfg)).toBe("high");
    });
  }
});

describe("bucketConfidence — AI-derived sources tier by confidence", () => {
  it("ai at confidence 95 (≥ highThreshold 85) → high", () => {
    expect(bucketConfidence({ source: "ai", confidence: 95 }, cfg)).toBe("high");
  });

  it("ai at confidence 85 (== highThreshold) → high", () => {
    expect(bucketConfidence({ source: "ai", confidence: 85 }, cfg)).toBe("high");
  });

  it("ai at confidence 70 (between thresholds) → medium", () => {
    expect(bucketConfidence({ source: "ai", confidence: 70 }, cfg)).toBe("medium");
  });

  it("ai at confidence 50 (== mediumThreshold) → medium", () => {
    expect(bucketConfidence({ source: "ai", confidence: 50 }, cfg)).toBe("medium");
  });

  it("ai at confidence 49 (just below medium) → low", () => {
    expect(bucketConfidence({ source: "ai", confidence: 49 }, cfg)).toBe("low");
  });

  it("ai at confidence 0 → low", () => {
    expect(bucketConfidence({ source: "ai", confidence: 0 }, cfg)).toBe("low");
  });

  it("entity-propagation at confidence 85 → high (confidence-tiered, not deterministic)", () => {
    expect(
      bucketConfidence({ source: "entity-propagation", confidence: 85 }, cfg),
    ).toBe("high");
  });

  it("unknown source at confidence 70 → medium (treated as AI-derived)", () => {
    expect(bucketConfidence({ source: "unknown", confidence: 70 }, cfg)).toBe(
      "medium",
    );
  });
});

describe("bucketConfidence — config sensitivity", () => {
  it("strict config (high=95, medium=80) reclassifies an 85-confidence ai → medium", () => {
    const strict = { highThreshold: 95, mediumThreshold: 80, autoExportEnabled: true };
    expect(bucketConfidence({ source: "ai", confidence: 85 }, strict)).toBe(
      "medium",
    );
  });

  it("permissive config (high=70, medium=30) reclassifies a 60-confidence ai → medium not low", () => {
    const permissive = { highThreshold: 70, mediumThreshold: 30, autoExportEnabled: true };
    expect(
      bucketConfidence({ source: "ai", confidence: 60 }, permissive),
    ).toBe("medium");
  });
});

describe("tierToStatus", () => {
  const cases: Array<[Tier, "accepted" | "pending" | "rejected"]> = [
    ["high", "accepted"],
    ["medium", "pending"],
    ["low", "rejected"],
  ];
  for (const [tier, status] of cases) {
    it(`${tier} → ${status}`, () => {
      expect(tierToStatus(tier)).toBe(status);
    });
  }
});
