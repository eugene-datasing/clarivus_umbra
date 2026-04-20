import { describe, it, expect } from "vitest";
import { TYPE_TO_PATHWAY, pathwayFor, ALL_PATHWAYS } from "../pathways";

describe("pathwayFor", () => {
  it("maps each entry in TYPE_TO_PATHWAY to one of the four pathways", () => {
    for (const [type, pathway] of Object.entries(TYPE_TO_PATHWAY)) {
      expect(ALL_PATHWAYS).toContain(pathway);
      expect(pathwayFor(type)).toBe(pathway);
    }
  });

  it("returns undefined for unknown types", () => {
    expect(pathwayFor("not-a-real-type")).toBeUndefined();
    expect(pathwayFor("")).toBeUndefined();
    expect(pathwayFor("custom-rule-42")).toBeUndefined();
    expect(pathwayFor("manual")).toBeUndefined();
  });

  it("covers every type in lib/detection-type-grounds.ts that has a pathway meaning", () => {
    // Spot-check all four pathways have at least one type mapped.
    const pathways = new Set(Object.values(TYPE_TO_PATHWAY));
    expect(pathways.has("personal")).toBe(true);
    expect(pathways.has("commercial")).toBe(true);
    expect(pathways.has("governance")).toBe(true);
    expect(pathways.has("enforcement")).toBe(true);
  });
});
