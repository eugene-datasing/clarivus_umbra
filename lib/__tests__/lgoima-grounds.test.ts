import { describe, it, expect } from "vitest";
import {
  lgoimaGrounds,
  getGroundsBySection,
  getGroundById,
  type LGOIMAGround,
} from "../lgoima-grounds";

describe("lgoimaGrounds data", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(lgoimaGrounds)).toBe(true);
    expect(lgoimaGrounds.length).toBeGreaterThan(0);
  });

  it("contains entries for all three sections (s6, s7, s17)", () => {
    const sections = new Set(lgoimaGrounds.map((g) => g.section));
    expect(sections.has("s6")).toBe(true);
    expect(sections.has("s7")).toBe(true);
    expect(sections.has("s17")).toBe(true);
  });

  it("each ground has all required fields", () => {
    for (const g of lgoimaGrounds) {
      expect(g.id).toBeTruthy();
      expect(typeof g.id).toBe("string");
      expect(["s6", "s7", "s17"]).toContain(g.section);
      expect(g.reference).toBeTruthy();
      expect(g.label).toBeTruthy();
      expect(g.description).toBeTruthy();
      expect(typeof g.common).toBe("boolean");
      expect(typeof g.requiresPI).toBe("boolean");
    }
  });

  it("has unique IDs", () => {
    const ids = lgoimaGrounds.map((g) => g.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("has unique references", () => {
    const refs = lgoimaGrounds.map((g) => g.reference);
    const uniqueRefs = new Set(refs);
    expect(uniqueRefs.size).toBe(refs.length);
  });

  it("s6 grounds do not require public interest test", () => {
    const s6 = lgoimaGrounds.filter((g) => g.section === "s6");
    for (const g of s6) {
      expect(g.requiresPI).toBe(false);
    }
  });

  it("s7 grounds all require public interest test", () => {
    const s7 = lgoimaGrounds.filter((g) => g.section === "s7");
    for (const g of s7) {
      expect(g.requiresPI).toBe(true);
    }
  });

  it("s17 grounds do not require public interest test", () => {
    const s17 = lgoimaGrounds.filter((g) => g.section === "s17");
    for (const g of s17) {
      expect(g.requiresPI).toBe(false);
    }
  });

  it("includes the commonly-used s7(2)(a) personal privacy ground", () => {
    const privacy = lgoimaGrounds.find((g) => g.reference === "s7(2)(a)");
    expect(privacy).toBeDefined();
    expect(privacy!.common).toBe(true);
    expect(privacy!.label).toContain("privacy");
  });

  it("includes the s7(2)(f) free and frank opinions ground", () => {
    const frank = lgoimaGrounds.find((g) => g.reference === "s7(2)(f)");
    expect(frank).toBeDefined();
    expect(frank!.common).toBe(true);
  });

  it("includes s7(2)(g) legal professional privilege", () => {
    const legal = lgoimaGrounds.find((g) => g.reference === "s7(2)(g)");
    expect(legal).toBeDefined();
    expect(legal!.common).toBe(true);
  });
});

describe("getGroundsBySection", () => {
  it("returns only s6 grounds for section s6", () => {
    const results = getGroundsBySection("s6");
    expect(results.length).toBeGreaterThan(0);
    for (const g of results) {
      expect(g.section).toBe("s6");
    }
  });

  it("returns only s7 grounds for section s7", () => {
    const results = getGroundsBySection("s7");
    expect(results.length).toBeGreaterThan(0);
    for (const g of results) {
      expect(g.section).toBe("s7");
    }
  });

  it("returns only s17 grounds for section s17", () => {
    const results = getGroundsBySection("s17");
    expect(results.length).toBeGreaterThan(0);
    for (const g of results) {
      expect(g.section).toBe("s17");
    }
  });

  it("returns correct count for s6 (5 grounds)", () => {
    const results = getGroundsBySection("s6");
    expect(results.length).toBe(5);
  });

  it("returns the largest count for s7", () => {
    const s7 = getGroundsBySection("s7");
    const s6 = getGroundsBySection("s6");
    const s17 = getGroundsBySection("s17");
    expect(s7.length).toBeGreaterThan(s6.length);
    expect(s7.length).toBeGreaterThan(s17.length);
  });
});

describe("getGroundById", () => {
  it("finds s7_2a by ID", () => {
    const ground = getGroundById("s7_2a");
    expect(ground).toBeDefined();
    expect(ground!.reference).toBe("s7(2)(a)");
    expect(ground!.label).toContain("privacy");
  });

  it("finds s6a by ID", () => {
    const ground = getGroundById("s6a");
    expect(ground).toBeDefined();
    expect(ground!.section).toBe("s6");
  });

  it("returns undefined for non-existent ID", () => {
    const ground = getGroundById("non-existent");
    expect(ground).toBeUndefined();
  });

  it("returns undefined for empty string ID", () => {
    const ground = getGroundById("");
    expect(ground).toBeUndefined();
  });
});
