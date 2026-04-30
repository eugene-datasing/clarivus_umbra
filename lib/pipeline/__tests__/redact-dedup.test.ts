import { describe, it, expect } from "vitest";
import {
  dedupeCoordinateRedactions,
  dedupeTextSearchRedactions,
  TEXT_SEARCH_MAX_LENGTH,
} from "../redact-pdf";

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

  // ---------------------------------------------------------------------
  // skipLongTextGuard option (2026-04-30, Fix B for zero-bbox AI long
  // narrative). The Tier 1+2 chain in redactCanonicalPdf needs to feed
  // long zero-bbox detections through text-search; the default 80-char
  // filter would no-op the chain. The option opts out of the filter
  // for that one call site without changing the standalone Tier 2
  // path's behaviour.
  // ---------------------------------------------------------------------
  describe("skipLongTextGuard option (Fix B for zero-bbox chain)", () => {
    it("retains long detections when skipLongTextGuard:true", () => {
      const longText = "you're out of your depth Helen - let's be honest, you got this job because they needed a woman on the panel.";
      expect(longText.length).toBeGreaterThan(80);
      const detections = [
        { text: longText, page: 1, appliedGround: "s7_2fii", suggestedGround: null },
      ];
      const result = dedupeTextSearchRedactions(detections, { skipLongTextGuard: true });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(longText);
    });

    it("still drops long detections when option is omitted (default behaviour preserved)", () => {
      const longText = "x".repeat(100);
      const detections = [
        { text: longText, page: 1, appliedGround: "s7_2a", suggestedGround: null },
      ];
      expect(dedupeTextSearchRedactions(detections)).toHaveLength(0);
      expect(dedupeTextSearchRedactions(detections, {})).toHaveLength(0);
      expect(dedupeTextSearchRedactions(detections, { skipLongTextGuard: false })).toHaveLength(0);
    });

    it("still dedupes by (page, text) when skipLongTextGuard:true", () => {
      // The option only affects the length filter — dedup behaviour
      // stays identical so a chained call with duplicate zero-bbox
      // rows still collapses cleanly.
      const longText = "x".repeat(120);
      const detections = [
        { text: longText, page: 1, appliedGround: "s7_2a", suggestedGround: null },
        { text: longText, page: 1, appliedGround: "s7_2a", suggestedGround: null },
      ];
      const result = dedupeTextSearchRedactions(detections, { skipLongTextGuard: true });
      expect(result).toHaveLength(1);
    });

    it("preserves the (page, text) split for the same long text on different pages", () => {
      const longText = "x".repeat(120);
      const detections = [
        { text: longText, page: 1, appliedGround: "s7_2a", suggestedGround: null },
        { text: longText, page: 2, appliedGround: "s7_2a", suggestedGround: null },
      ];
      const result = dedupeTextSearchRedactions(detections, { skipLongTextGuard: true });
      expect(result).toHaveLength(2);
    });

    it("uses the same ground-resolution path (appliedGround || suggestedGround) regardless of length", () => {
      const longText = "y".repeat(150);
      const detections = [
        { text: longText, page: 1, appliedGround: null, suggestedGround: "s7_2fi" },
      ];
      const result = dedupeTextSearchRedactions(detections, { skipLongTextGuard: true });
      expect(result).toHaveLength(1);
      expect(result[0].label).toContain("s7(2)(f)(i)");
    });
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

// ---------------------------------------------------------------------------
// Coordinate-mode dedup (Bug 6 fix)
// ---------------------------------------------------------------------------
//
// Helper: minimal CoordinateDetection shape. The exported function
// only needs the seven fields below; everything else on a real
// Detection row (id, status, text, source, etc.) is irrelevant for
// the spatial dedup itself.
type Det = {
  page: number;
  posX: number;
  posY: number;
  posW: number;
  posH: number;
  appliedGround: string | null;
  suggestedGround: string | null;
};

function det(
  page: number,
  posX: number,
  posY: number,
  posW: number,
  posH: number,
  applied: string | null = "s7_2a",
  suggested: string | null = null,
): Det {
  return {
    page,
    posX,
    posY,
    posW,
    posH,
    appliedGround: applied,
    suggestedGround: suggested,
  };
}

describe("dedupeCoordinateRedactions — empty / pass-through", () => {
  it("returns empty for empty input", () => {
    expect(dedupeCoordinateRedactions([])).toEqual([]);
  });

  it("preserves a single non-overlapping row unchanged", () => {
    const result = dedupeCoordinateRedactions([det(1, 10, 20, 5, 2)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ page: 1, posX: 10, posY: 20, posW: 5, posH: 2 });
  });

  it("passes through independent non-overlapping rows on the same page", () => {
    const result = dedupeCoordinateRedactions([
      det(1, 10, 10, 5, 2),
      det(1, 10, 50, 5, 2),
      det(1, 80, 10, 5, 2),
    ]);
    expect(result).toHaveLength(3);
  });
});

describe("dedupeCoordinateRedactions — exact-duplicate collapse", () => {
  it("collapses two rows with identical bbox", () => {
    const result = dedupeCoordinateRedactions([
      det(1, 10, 20, 5, 2, "s7_2a"),
      det(1, 10, 20, 5, 2, "s7_2a"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ posX: 10, posY: 20, posW: 5, posH: 2 });
  });

  it("collapses three+ rows with identical bbox", () => {
    const result = dedupeCoordinateRedactions([
      det(1, 10, 20, 5, 2),
      det(1, 10, 20, 5, 2),
      det(1, 10, 20, 5, 2),
    ]);
    expect(result).toHaveLength(1);
  });

  it("keeps detections with identical bbox but different page separate", () => {
    const result = dedupeCoordinateRedactions([
      det(1, 10, 20, 5, 2),
      det(2, 10, 20, 5, 2),
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("dedupeCoordinateRedactions — containment collapse", () => {
  it("collapses contained rows, returning the larger bbox", () => {
    // Outer rect 10..30 wide × 20..25 tall; inner rect 12..18 × 21..24
    const outer = det(1, 10, 20, 20, 5);
    const inner = det(1, 12, 21, 6, 3);
    const result = dedupeCoordinateRedactions([outer, inner]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ posX: 10, posY: 20, posW: 20, posH: 5 });
  });

  it("recovers the larger bbox when input ordering puts the smaller one first", () => {
    const inner = det(1, 12, 21, 6, 3);
    const outer = det(1, 10, 20, 20, 5);
    const result = dedupeCoordinateRedactions([inner, outer]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ posX: 10, posY: 20, posW: 20, posH: 5 });
  });

  it("does NOT collapse when smaller rect is NOT enclosed by larger (touches edge but extends past)", () => {
    // Larger rect 10..20, smaller rect 18..25 — overlaps but neither contains.
    // Falls through to the general-overlap union case → still merges
    // (one entry), but bbox is the UNION not the larger-only.
    const a = det(1, 10, 20, 10, 5); // 10..20
    const b = det(1, 18, 21, 7, 3);  // 18..25 — extends past 20
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result).toHaveLength(1);
    // Union: x=10..25, w=15
    expect(result[0]).toMatchObject({ posX: 10, posW: 15 });
  });
});

describe("dedupeCoordinateRedactions — general overlap union", () => {
  it("emits the union rect for two partial-overlap rows", () => {
    const a = det(1, 10, 20, 10, 5);  // 10..20, 20..25
    const b = det(1, 15, 22, 10, 5);  // 15..25, 22..27
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result).toHaveLength(1);
    // Union: x=10..25 (w=15), y=20..27 (h=7)
    expect(result[0]).toMatchObject({
      posX: 10,
      posY: 20,
      posW: 15,
      posH: 7,
    });
  });

  it("groups transitively (A overlaps B, B overlaps C, but A does NOT overlap C directly)", () => {
    // A: 10..20
    // B: 18..28 (overlaps A on 18..20, overlaps C on 26..28)
    // C: 26..36
    // Final union should span 10..36.
    const a = det(1, 10, 20, 10, 5);
    const b = det(1, 18, 20, 10, 5);
    const c = det(1, 26, 20, 10, 5);
    const result = dedupeCoordinateRedactions([a, b, c]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ posX: 10, posW: 26, posY: 20, posH: 5 });
  });
});

describe("dedupeCoordinateRedactions — most-restrictive-ground priority", () => {
  it("picks s6 over s7 when both are present in the group", () => {
    const a = det(1, 10, 20, 10, 5, "s7_2a");
    const b = det(1, 10, 20, 10, 5, "s6c");
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result).toHaveLength(1);
    // s6(c) is the canonical reference for the s6c id.
    expect(result[0].label).toBe("s6(c)");
  });

  it("picks s7(2)(g) (legal-privilege) over s7(2)(a) (privacy)", () => {
    const a = det(1, 10, 20, 10, 5, "s7_2a");
    const b = det(1, 10, 20, 10, 5, "s7_2g");
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result[0].label).toBe("s7(2)(g)");
  });

  it("picks s7(2)(c)(i) (confidence) over s7(2)(a)", () => {
    const a = det(1, 10, 20, 10, 5, "s7_2a");
    const b = det(1, 10, 20, 10, 5, "s7_2ci");
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result[0].label).toBe("s7(2)(c)(i)");
  });

  it("picks s7(2)(f)(i) (free-frank) over s7(2)(a) (privacy) — the B1 scenario", () => {
    const a = det(1, 40.31, 35.11, 49.45, 1.34, "s7_2fi"); // section-marker free-frank
    const b = det(1, 40.31, 35.11, 9.57, 1.34, "s7_2a");   // entity-propagation Ferguson
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result).toHaveLength(1);
    // Free-frank wins over privacy.
    expect(result[0].label).toBe("s7(2)(f)(i)");
    // Bbox is the larger free-frank sentence (containment case).
    expect(result[0]).toMatchObject({ posX: 40.31, posY: 35.11, posW: 49.45 });
  });

  it("falls back to suggestedGround when appliedGround is null", () => {
    const a = det(1, 10, 20, 10, 5, null, "s6a");
    const b = det(1, 10, 20, 10, 5, "s7_2a");
    const result = dedupeCoordinateRedactions([a, b]);
    // s6(a) wins over s7(2)(a) regardless of which slot it lives in.
    expect(result[0].label).toBe("s6(a)");
  });

  it("emits empty label string when no member has any ground", () => {
    const a = det(1, 10, 20, 10, 5, null, null);
    const b = det(1, 10, 20, 10, 5, null, null);
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("");
  });
});

describe("dedupeCoordinateRedactions — multi-page non-interaction", () => {
  it("groups within a page but never across pages, even with identical bboxes", () => {
    const result = dedupeCoordinateRedactions([
      det(1, 10, 20, 10, 5),
      det(2, 10, 20, 10, 5),
      det(3, 10, 20, 10, 5),
    ]);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.page)).toEqual([1, 2, 3]);
  });

  it("interleaves pages cleanly — page-1 group + page-2 group", () => {
    const result = dedupeCoordinateRedactions([
      // page 1: 3 overlapping rows → 1 group
      det(1, 10, 20, 10, 5),
      det(1, 12, 21, 6, 3),
      det(1, 14, 22, 4, 2),
      // page 2: 1 standalone row
      det(2, 10, 20, 10, 5),
      // page 1 again: 1 standalone row at a different y
      det(1, 50, 60, 10, 5),
    ]);
    expect(result).toHaveLength(3);
  });
});

describe("dedupeCoordinateRedactions — Bug 6 reproduction (canonical input)", () => {
  it("collapses the B1 free-frank/Ferguson overlap to one entry with free-frank ground", () => {
    // Exact bbox from the live dev DB (B1, page 3):
    //   section-marker free-frank — posW=49.45 (full sentence)
    //   entity-propagation personal-name — posW=9.57 (Ferguson surname)
    // Both at posX=40.31, posY=35.11. Both eligible at appliedGround
    // s7_2a / s7_2fi. The dedup must collapse them into one wider
    // rect with the most-restrictive ground (s7_2fi — free-frank).
    const sectionMarker = det(3, 40.31, 35.11, 49.45, 1.34, "s7_2fi");
    const propagation = det(3, 40.31, 35.11, 9.57, 1.34, "s7_2a");
    const result = dedupeCoordinateRedactions([sectionMarker, propagation]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      page: 3,
      posX: 40.31,
      posY: 35.11,
      posW: 49.45,
      posH: 1.34,
      label: "s7(2)(f)(i)",
    });
  });

  it("collapses the bank-account/phone exact-duplicate overlap from regex pipeline", () => {
    // Bbox from `cmo5enehy00002z6cicgod7np` page 1:
    //   pattern bank-account "12-3056-0789123-00" at (50.06, 36.07, 14.44, 1.26)
    //   pattern phone "0789123-00" at the same exact bbox (regex misclass)
    // Both at appliedGround s7_2a → one survivor at the same bbox.
    const bank = det(1, 50.06, 36.07, 14.44, 1.26, "s7_2a");
    const phone = det(1, 50.06, 36.07, 14.44, 1.26, "s7_2a");
    const result = dedupeCoordinateRedactions([bank, phone]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      posX: 50.06,
      posY: 36.07,
      posW: 14.44,
      posH: 1.26,
    });
  });
});
