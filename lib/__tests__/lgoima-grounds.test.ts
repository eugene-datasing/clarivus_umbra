import { describe, it, expect } from "vitest";
import {
  lgoimaGrounds,
  getGroundsBySection,
  getGroundById,
  getGroundByReference,
  getGroundLabelMap,
  type LGOIMAGround,
} from "../lgoima-grounds";

describe("lgoimaGrounds data", () => {
  it("contains exactly 27 grounds (4 s6 + 14 s7 + 9 s17)", () => {
    expect(lgoimaGrounds.length).toBe(27);
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

  it("does NOT include s6(e) — that provision does not exist in LGOIMA", () => {
    const s6e = lgoimaGrounds.find(
      (g) => g.reference === "s6(e)" || g.id === "s6e",
    );
    expect(s6e).toBeUndefined();
  });

  it("includes s7(2)(ba) tikanga Māori / wāhi tapu", () => {
    const ba = lgoimaGrounds.find((g) => g.reference === "s7(2)(ba)");
    expect(ba).toBeDefined();
    expect(ba!.id).toBe("s7_2ba");
    expect(ba!.requiresPI).toBe(true);
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
    expect(privacy!.label).toContain("Privacy");
  });

  it("includes s7(2)(f)(i) free and frank opinions (split from s7(2)(f))", () => {
    const frank = lgoimaGrounds.find((g) => g.reference === "s7(2)(f)(i)");
    expect(frank).toBeDefined();
    expect(frank!.common).toBe(true);
  });

  it("includes s7(2)(f)(ii) protection from harassment (split from s7(2)(f))", () => {
    const harassment = lgoimaGrounds.find((g) => g.reference === "s7(2)(f)(ii)");
    expect(harassment).toBeDefined();
    expect(harassment!.common).toBe(false);
  });

  it("includes s7(2)(c)(i) and s7(2)(c)(ii) (split from s7(2)(c))", () => {
    const ci = lgoimaGrounds.find((g) => g.reference === "s7(2)(c)(i)");
    const cii = lgoimaGrounds.find((g) => g.reference === "s7(2)(c)(ii)");
    expect(ci).toBeDefined();
    expect(cii).toBeDefined();
  });

  it("includes s7(2)(g) legal professional privilege", () => {
    const legal = lgoimaGrounds.find((g) => g.reference === "s7(2)(g)");
    expect(legal).toBeDefined();
    expect(legal!.common).toBe(true);
  });

  it("s7(2)(j) is improper gain, not incomplete negotiations", () => {
    const j = lgoimaGrounds.find((g) => g.reference === "s7(2)(j)");
    expect(j).toBeDefined();
    expect(j!.label).toContain("Improper gain");
  });

  it("s7(2)(d) is health/safety, not statutory restriction", () => {
    const d = lgoimaGrounds.find((g) => g.reference === "s7(2)(d)");
    expect(d).toBeDefined();
    expect(d!.label).toContain("Health");
  });

  it("s7(2)(e) is material loss, not public health/safety", () => {
    const e = lgoimaGrounds.find((g) => g.reference === "s7(2)(e)");
    expect(e).toBeDefined();
    expect(e!.label).toContain("Material loss");
  });

  it("s17 references match actual LGOIMA subsections", () => {
    const s17Refs = lgoimaGrounds
      .filter((g) => g.section === "s17")
      .map((g) => g.reference)
      .sort();
    expect(s17Refs).toEqual([
      "s17(a)",
      "s17(b)",
      "s17(c)(i)",
      "s17(c)(ii)",
      "s17(d)",
      "s17(e)",
      "s17(f)",
      "s17(g)",
      "s17(h)",
    ]);
  });
});

describe("getGroundsBySection", () => {
  it("returns 4 grounds for s6", () => {
    const results = getGroundsBySection("s6");
    expect(results.length).toBe(4);
    for (const g of results) {
      expect(g.section).toBe("s6");
    }
  });

  it("returns 14 grounds for s7", () => {
    const results = getGroundsBySection("s7");
    expect(results.length).toBe(14);
    for (const g of results) {
      expect(g.section).toBe("s7");
    }
  });

  it("returns 9 grounds for s17", () => {
    const results = getGroundsBySection("s17");
    expect(results.length).toBe(9);
    for (const g of results) {
      expect(g.section).toBe("s17");
    }
  });

  it("s7 has the largest count", () => {
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
  });

  it("finds s6a by ID", () => {
    const ground = getGroundById("s6a");
    expect(ground).toBeDefined();
    expect(ground!.section).toBe("s6");
  });

  it("returns undefined for non-existent ID", () => {
    expect(getGroundById("non-existent")).toBeUndefined();
  });

  it("returns undefined for empty string ID", () => {
    expect(getGroundById("")).toBeUndefined();
  });
});

describe("getGroundByReference", () => {
  it("finds ground by reference format", () => {
    const ground = getGroundByReference("s7(2)(a)");
    expect(ground).toBeDefined();
    expect(ground!.id).toBe("s7_2a");
  });

  it("finds split grounds by reference", () => {
    expect(getGroundByReference("s7(2)(c)(i)")).toBeDefined();
    expect(getGroundByReference("s7(2)(f)(ii)")).toBeDefined();
  });

  it("returns undefined for non-existent reference", () => {
    expect(getGroundByReference("s6(e)")).toBeUndefined();
  });
});

describe("getGroundLabelMap", () => {
  it("returns a map keyed by both ID and reference", () => {
    const map = getGroundLabelMap();
    // ID format
    expect(map["s7_2a"]).toBe("Privacy of natural persons");
    // Reference format
    expect(map["s7(2)(a)"]).toBe("Privacy of natural persons");
  });

  it("contains entries for all 27 grounds (54 keys: 27 IDs + 27 refs)", () => {
    const map = getGroundLabelMap();
    expect(Object.keys(map).length).toBe(54);
  });
});
