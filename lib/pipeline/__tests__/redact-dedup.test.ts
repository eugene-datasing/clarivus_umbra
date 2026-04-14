import { describe, it, expect } from "vitest";
import { dedupeTextSearchRedactions, TEXT_SEARCH_MAX_LENGTH } from "../redact-pdf";

describe("dedupeTextSearchRedactions", () => {
  it("deduplicates detections with the same (page, text)", () => {
    const detections = [
      { text: "021 544 908", page: 1, appliedGround: "s7_2a", suggestedGround: null },
      { text: "021 544 908", page: 1, appliedGround: "s7_2a", suggestedGround: null },
      { text: "021 544 908", page: 1, appliedGround: "s7_2a", suggestedGround: null },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("021 544 908");
    expect(result[0].page).toBe(1);
  });

  it("keeps detections with the same text on different pages", () => {
    const detections = [
      { text: "021 544 908", page: 1, appliedGround: "s7_2a", suggestedGround: null },
      { text: "021 544 908", page: 2, appliedGround: "s7_2a", suggestedGround: null },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(2);
  });

  it("keeps different texts on the same page", () => {
    const detections = [
      { text: "Maia Rangi", page: 1, appliedGround: "s7_2a", suggestedGround: null },
      { text: "021 544 908", page: 1, appliedGround: "s7_2a", suggestedGround: null },
      { text: "ZTW4721", page: 1, appliedGround: "s7_2a", suggestedGround: null },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(3);
  });

  it("uses the ground from the first occurrence", () => {
    const detections = [
      { text: "021 544 908", page: 1, appliedGround: "s7_2a", suggestedGround: null },
      { text: "021 544 908", page: 1, appliedGround: null, suggestedGround: "s7_2b" },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(1);
    // s7_2a ground from the first entry should be used
    expect(result[0].label).toContain("s7(2)(a)");
  });

  it("filters out detections over 80 characters", () => {
    const shortText = "NZD 97,461"; // 10 chars
    const longText = "Negotiation-sensitive language appears in valuation floors and ceilings, fallback positions, authorised concession limits"; // 120 chars

    const detections = [
      { text: shortText, page: 1, appliedGround: "s7_2bii", suggestedGround: null },
      { text: longText, page: 1, appliedGround: "s7_2i", suggestedGround: null },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(shortText);
  });

  it("allows detections at exactly 80 characters", () => {
    const text80 = "x".repeat(80);
    const text81 = "x".repeat(81);
    const detections = [
      { text: text80, page: 1, appliedGround: null, suggestedGround: "s7_2a" },
      { text: text81, page: 1, appliedGround: null, suggestedGround: "s7_2a" },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text80);
  });

  it("handles a realistic mix of duplicates and long texts", () => {
    // Simulates the 07_formal_report case: 46x "021 544 908", 26x email, plus long AI summaries
    const detections = [
      // 46 duplicates of the same phone number
      ...Array.from({ length: 46 }, () => ({
        text: "021 544 908", page: 1, appliedGround: "s7_2a", suggestedGround: null,
      })),
      // 26 duplicates of the same email
      ...Array.from({ length: 26 }, () => ({
        text: "maia.rangi@seaviewdevelopments.nz", page: 1, appliedGround: "s7_2a", suggestedGround: null,
      })),
      // 1 short unique detection
      { text: "ZTW4721", page: 1, appliedGround: "s7_2a", suggestedGround: null },
      // 1 long AI summary that should be filtered
      {
        text: "Negotiation-sensitive language appears in valuation floors and ceilings, fallback positions, authorised concession limits, settlement scenarios",
        page: 1, appliedGround: "s7_2i", suggestedGround: null,
      },
    ];
    const result = dedupeTextSearchRedactions(detections);
    // Should produce 3: phone, email, NHI (long text filtered, duplicates collapsed)
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.text).sort()).toEqual([
      "021 544 908",
      "ZTW4721",
      "maia.rangi@seaviewdevelopments.nz",
    ]);
  });

  it("returns empty array for all-long detections", () => {
    const detections = [
      { text: "x".repeat(100), page: 1, appliedGround: null, suggestedGround: "s7_2a" },
      { text: "y".repeat(200), page: 2, appliedGround: null, suggestedGround: "s7_2a" },
    ];
    expect(dedupeTextSearchRedactions(detections)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(dedupeTextSearchRedactions([])).toHaveLength(0);
  });
});

describe("TEXT_SEARCH_MAX_LENGTH", () => {
  it("is 80", () => {
    expect(TEXT_SEARCH_MAX_LENGTH).toBe(80);
  });
});
