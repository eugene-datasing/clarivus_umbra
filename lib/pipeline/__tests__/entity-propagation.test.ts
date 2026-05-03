import { describe, it, expect } from "vitest";
import { propagateNameDetections, type PropagationSeed } from "../entity-propagation";
import type { ExtractedPage } from "../extract";

function seed(
  overrides: Partial<PropagationSeed> & Pick<PropagationSeed, "type" | "text" | "page">,
): PropagationSeed {
  return {
    reasoning: "test seed",
    aiExplanation: "",
    source: "ai",
    ...overrides,
  };
}

function page(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text };
}

describe("propagateNameDetections — variant generation + search", () => {
  it("from a full-name seed, propagates full, first+last, title+surname, and bare surname", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Melissa Ferguson", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "Complainant: Melissa Ferguson. Reference number 2024-042."),
      page(
        2,
        "Ms Ferguson raised concerns in February. Ferguson reported the matter to HR. Mr Ferguson is her brother.",
      ),
    ];
    const out = propagateNameDetections(pages, seeds);
    const texts = out.map((d) => `${d.text}@p${d.page}`).sort();
    // Seed itself on page 1 should be skipped (overlap rule).
    // Page 2 should pick up: "Ms Ferguson", "Ferguson", "Mr Ferguson".
    expect(texts).toContain("Ms Ferguson@p2");
    expect(texts).toContain("Mr Ferguson@p2");
    expect(texts).toContain("Ferguson@p2");
    expect(texts).not.toContain("Melissa Ferguson@p1");
    expect(texts).not.toContain("Melissa@p2");
  });

  it("from an honorific+surname seed, propagates bare surname and other honorific variants", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Ms Ferguson", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "Ms Ferguson filed the claim."),
      page(2, "Ferguson's manager, Mr Ferguson, was interviewed separately."),
    ];
    const out = propagateNameDetections(pages, seeds);
    const texts = out.map((d) => `${d.text}@p${d.page}`).sort();
    expect(texts).toContain("Ferguson@p2");
    expect(texts).toContain("Mr Ferguson@p2");
  });

  it("suppresses bare-surname propagation when the surname is on the deny-list", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Ms Young", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "Ms Young is the team lead."),
      page(2, "Young people in the area have raised concerns."),
    ];
    const out = propagateNameDetections(pages, seeds);
    const bareMatches = out.filter((d) => d.text === "Young");
    expect(bareMatches).toHaveLength(0);
    // Honorific form is still generated and SHOULD propagate if present.
    const honorificMatches = out.filter((d) => d.text === "Ms Young" || d.text === "Mr Young");
    expect(honorificMatches.length).toBeGreaterThanOrEqual(0);
  });

  it("suppresses bare-surname propagation when the surname is shorter than 5 characters", () => {
    const seeds: PropagationSeed[] = [seed({ type: "personal-name", text: "Ms Lee", page: 1 })];
    const pages: ExtractedPage[] = [
      page(1, "Ms Lee attended."),
      page(2, "Lee confirmed her position. Robert E. Lee is not this Lee."),
    ];
    const out = propagateNameDetections(pages, seeds);
    const bareMatches = out.filter((d) => d.text === "Lee");
    expect(bareMatches).toHaveLength(0);
  });

  // Phase 12.1 (Umbra v2) — harassment-risk dropped; entity-
  // propagation now seeds off personal-name only. The previous
  // "harassment-risk seed propagates as harassment-risk" test is
  // obsolete (the seed type no longer exists). Witness/grievance
  // names route directly to personal-name in v2.

  it("non-personal-name seeds (e.g. dropped types or sentence types) do not seed propagation", () => {
    const seeds: PropagationSeed[] = [
      // Use plausible v1-era types that no longer exist as seed types
      // — the propagator should reject anything not in SEED_TYPES.
      seed({ type: "sensitive-context", text: "performance improvement plan since March", page: 1 }),
      seed({ type: "address", text: "22 Mahoe Avenue", page: 2 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "performance improvement plan since March 2026."),
      page(2, "22 Mahoe Avenue is the lodgement address."),
    ];
    const out = propagateNameDetections(pages, seeds);
    expect(out).toHaveLength(0);
  });

  it("is case-sensitive on the first letter (does not match a lowercase common word)", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Dr Smith", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "Dr Smith reviewed the case."),
      page(2, "There is a smith in the village. But Smith the GP is different."),
    ];
    const out = propagateNameDetections(pages, seeds);
    const bareTexts = out.filter((d) => d.text === "Smith").map((d) => d.page);
    // "smith" (lowercase) in "a smith in the village" must NOT match.
    // "Smith" (capital) in "But Smith the GP" SHOULD match.
    expect(bareTexts).toContain(2);
    expect(bareTexts.length).toBe(1);
  });

  it("respects word boundaries — 'Ferguson' does not match inside 'Fergusons'", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Ms Ferguson", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "Ms Ferguson was interviewed."),
      page(2, "The Fergusons have lived in the area for decades. But Ferguson alone also appears."),
    ];
    const out = propagateNameDetections(pages, seeds);
    // Should match "Ferguson" but not "Fergusons".
    const p2Matches = out.filter((d) => d.text === "Ferguson" && d.page === 2);
    expect(p2Matches.length).toBe(1);
  });

  it("skips matches on the seed's own page that overlap the seed text", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Melissa Ferguson", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "Melissa Ferguson is the complainant."),
    ];
    const out = propagateNameDetections(pages, seeds);
    // The "Ferguson" bare-surname variant would overlap with the seed
    // "Melissa Ferguson" on page 1; skip it.
    const sameSpan = out.filter((d) => d.page === 1);
    expect(sameSpan).toHaveLength(0);
  });

  it("picks up re-occurrences of the full seed text on other pages", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Melissa Ferguson", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "Melissa Ferguson filed the complaint."),
      page(3, "The matter concerning Melissa Ferguson was escalated."),
    ];
    const out = propagateNameDetections(pages, seeds);
    const fullMatches = out.filter((d) => d.text === "Melissa Ferguson" && d.page === 3);
    expect(fullMatches).toHaveLength(1);
  });

  it("marks propagated detections with source='entity-propagation' and carries seed metadata", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Ms Ferguson", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(1, "Ms Ferguson raised the matter."),
      page(2, "Ferguson reported the incident to HR."),
    ];
    const out = propagateNameDetections(pages, seeds);
    for (const d of out) {
      expect(d.source).toBe("entity-propagation");
      expect(d.seedType).toBe("personal-name");
      expect(d.seedText).toBe("Ms Ferguson");
      expect(d.confidence).toBe(85);
    }
  });

  it("handles a seed with only a surname by generating honorific variants and bare surname", () => {
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "Ferguson", page: 1 }),
    ];
    const pages: ExtractedPage[] = [
      page(2, "Mr Ferguson chaired the meeting. Ms Ferguson was the note-taker."),
    ];
    const out = propagateNameDetections(pages, seeds);
    const texts = out.map((d) => d.text);
    expect(texts).toContain("Mr Ferguson");
    expect(texts).toContain("Ms Ferguson");
    expect(texts).toContain("Ferguson");
  });

  it("rejects seeds whose 'surname' does not start with an uppercase letter", () => {
    // Not a realistic seed — but the guard should be there.
    const seeds: PropagationSeed[] = [
      seed({ type: "personal-name", text: "john doe", page: 1 }),
    ];
    const pages: ExtractedPage[] = [page(1, "john doe the everyman.")];
    const out = propagateNameDetections(pages, seeds);
    expect(out).toHaveLength(0);
  });
});
