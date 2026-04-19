import { describe, it, expect } from "vitest";
import {
  DEFAULT_GROUND_FOR_TYPE,
  getDefaultGroundForType,
} from "../detection-type-grounds";

describe("getDefaultGroundForType", () => {
  it("returns s7_2a for personal PII types", () => {
    expect(getDefaultGroundForType("personal-name")).toBe("s7_2a");
    expect(getDefaultGroundForType("phone")).toBe("s7_2a");
    expect(getDefaultGroundForType("email-addr")).toBe("s7_2a");
    expect(getDefaultGroundForType("ird")).toBe("s7_2a");
    expect(getDefaultGroundForType("address")).toBe("s7_2a");
    expect(getDefaultGroundForType("bank-account")).toBe("s7_2a");
    expect(getDefaultGroundForType("nz-passport")).toBe("s7_2a");
    expect(getDefaultGroundForType("vehicle-reg")).toBe("s7_2a");
    expect(getDefaultGroundForType("nhi")).toBe("s7_2a");
  });

  it("returns correct grounds for non-PII types", () => {
    expect(getDefaultGroundForType("commercial")).toBe("s7_2bii");
    expect(getDefaultGroundForType("free-frank")).toBe("s7_2fi");
    expect(getDefaultGroundForType("legal-privilege")).toBe("s7_2g");
    expect(getDefaultGroundForType("negotiation")).toBe("s7_2i");
    expect(getDefaultGroundForType("safety-concern")).toBe("s6d");
    expect(getDefaultGroundForType("law-enforcement")).toBe("s6c");
    expect(getDefaultGroundForType("council-commercial")).toBe("s7_2h");
    expect(getDefaultGroundForType("harassment-risk")).toBe("s7_2fii");
    expect(getDefaultGroundForType("cultural-sensitivity")).toBe("s7_2ba");
    expect(getDefaultGroundForType("health-safety")).toBe("s7_2d");
  });

  it("returns empty string for types without a default ground", () => {
    expect(getDefaultGroundForType("confidential")).toBe("");
    expect(getDefaultGroundForType("manual")).toBe("");
  });

  it("returns empty string for custom-* prefixed types", () => {
    expect(getDefaultGroundForType("custom-keyword")).toBe("");
    expect(getDefaultGroundForType("custom-pattern")).toBe("");
    expect(getDefaultGroundForType("custom-entity")).toBe("");
    expect(getDefaultGroundForType("custom-combination")).toBe("");
    expect(getDefaultGroundForType("custom-anything")).toBe("");
  });

  it("returns empty string for unknown types", () => {
    expect(getDefaultGroundForType("nonexistent")).toBe("");
    expect(getDefaultGroundForType("")).toBe("");
  });

  it("covers all defined types in the mapping", () => {
    const mappedTypes = Object.keys(DEFAULT_GROUND_FOR_TYPE);
    expect(mappedTypes.length).toBe(22);
    for (const type of mappedTypes) {
      const result = getDefaultGroundForType(type);
      expect(typeof result).toBe("string");
    }
  });
});
