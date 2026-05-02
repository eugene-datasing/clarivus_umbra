import { describe, it, expect } from "vitest";
import {
  dedupeCoordinateRedactions,
  dedupeTextSearchRedactions,
  TEXT_SEARCH_MAX_LENGTH,
} from "../redact-pdf";

describe("dedupeTextSearchRedactions", () => {
  it("deduplicates detections with the same (page, text)", () => {
    const detections = [
      { text: "021 544 908", page: 1 },
      { text: "021 544 908", page: 1 },
      { text: "021 544 908", page: 1 },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("021 544 908");
    expect(result[0].page).toBe(1);
  });

  it("keeps detections with the same text on different pages", () => {
    const detections = [
      { text: "021 544 908", page: 1 },
      { text: "021 544 908", page: 2 },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(2);
  });

  it("keeps different texts on the same page", () => {
    const detections = [
      { text: "Maia Rangi", page: 1 },
      { text: "021 544 908", page: 1 },
      { text: "ZTW4721", page: 1 },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(3);
  });

  it("filters out detections over 80 characters", () => {
    const shortText = "NZD 97,461";
    const longText =
      "Negotiation-sensitive language appears in valuation floors and ceilings, fallback positions, authorised concession limits";

    const detections = [
      { text: shortText, page: 1 },
      { text: longText, page: 1 },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(shortText);
  });

  it("allows detections at exactly 80 characters", () => {
    const text80 = "x".repeat(80);
    const text81 = "x".repeat(81);
    const detections = [
      { text: text80, page: 1 },
      { text: text81, page: 1 },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text80);
  });

  it("handles a realistic mix of duplicates and long texts", () => {
    const detections = [
      ...Array.from({ length: 46 }, () => ({ text: "021 544 908", page: 1 })),
      ...Array.from({ length: 26 }, () => ({
        text: "maia.rangi@seaviewdevelopments.nz",
        page: 1,
      })),
      { text: "ZTW4721", page: 1 },
      {
        text:
          "Negotiation-sensitive language appears in valuation floors and ceilings, fallback positions, authorised concession limits, settlement scenarios",
        page: 1,
      },
    ];
    const result = dedupeTextSearchRedactions(detections);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.text).sort()).toEqual([
      "021 544 908",
      "ZTW4721",
      "maia.rangi@seaviewdevelopments.nz",
    ]);
  });

  it("returns empty array for all-long detections", () => {
    const detections = [
      { text: "x".repeat(100), page: 1 },
      { text: "y".repeat(200), page: 2 },
    ];
    expect(dedupeTextSearchRedactions(detections)).toHaveLength(0);
  });

  describe("skipLongTextGuard option (Fix B for zero-bbox chain)", () => {
    it("retains long detections when skipLongTextGuard:true", () => {
      const longText =
        "you're out of your depth Helen - let's be honest, you got this job because they needed a woman on the panel.";
      expect(longText.length).toBeGreaterThan(80);
      const detections = [{ text: longText, page: 1 }];
      const result = dedupeTextSearchRedactions(detections, { skipLongTextGuard: true });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(longText);
    });

    it("still drops long detections when option is omitted (default behaviour preserved)", () => {
      const longText = "x".repeat(100);
      const detections = [{ text: longText, page: 1 }];
      expect(dedupeTextSearchRedactions(detections)).toHaveLength(0);
      expect(dedupeTextSearchRedactions(detections, {})).toHaveLength(0);
      expect(dedupeTextSearchRedactions(detections, { skipLongTextGuard: false })).toHaveLength(0);
    });

    it("still dedupes by (page, text) when skipLongTextGuard:true", () => {
      const longText = "x".repeat(120);
      const detections = [
        { text: longText, page: 1 },
        { text: longText, page: 1 },
      ];
      const result = dedupeTextSearchRedactions(detections, { skipLongTextGuard: true });
      expect(result).toHaveLength(1);
    });

    it("preserves the (page, text) split for the same long text on different pages", () => {
      const longText = "x".repeat(120);
      const detections = [
        { text: longText, page: 1 },
        { text: longText, page: 2 },
      ];
      const result = dedupeTextSearchRedactions(detections, { skipLongTextGuard: true });
      expect(result).toHaveLength(2);
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
type Det = {
  page: number;
  posX: number;
  posY: number;
  posW: number;
  posH: number;
};

function det(
  page: number,
  posX: number,
  posY: number,
  posW: number,
  posH: number,
): Det {
  return { page, posX, posY, posW, posH };
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
      det(1, 10, 20, 5, 2),
      det(1, 10, 20, 5, 2),
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
    const a = det(1, 10, 20, 10, 5);
    const b = det(1, 18, 21, 7, 3);
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ posX: 10, posW: 15 });
  });
});

describe("dedupeCoordinateRedactions — general overlap union", () => {
  it("emits the union rect for two partial-overlap rows", () => {
    const a = det(1, 10, 20, 10, 5);
    const b = det(1, 15, 22, 10, 5);
    const result = dedupeCoordinateRedactions([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      posX: 10,
      posY: 20,
      posW: 15,
      posH: 7,
    });
  });

  it("groups transitively (A overlaps B, B overlaps C, but A does NOT overlap C directly)", () => {
    const a = det(1, 10, 20, 10, 5);
    const b = det(1, 18, 20, 10, 5);
    const c = det(1, 26, 20, 10, 5);
    const result = dedupeCoordinateRedactions([a, b, c]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ posX: 10, posW: 26, posY: 20, posH: 5 });
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
      det(1, 10, 20, 10, 5),
      det(1, 12, 21, 6, 3),
      det(1, 14, 22, 4, 2),
      det(2, 10, 20, 10, 5),
      det(1, 50, 60, 10, 5),
    ]);
    expect(result).toHaveLength(3);
  });
});

describe("dedupeCoordinateRedactions — Bug 6 reproduction (canonical input)", () => {
  it("collapses the B1 free-frank/Ferguson overlap to one entry", () => {
    const sectionMarker = det(3, 40.31, 35.11, 49.45, 1.34);
    const propagation = det(3, 40.31, 35.11, 9.57, 1.34);
    const result = dedupeCoordinateRedactions([sectionMarker, propagation]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      page: 3,
      posX: 40.31,
      posY: 35.11,
      posW: 49.45,
      posH: 1.34,
    });
  });

  it("collapses the bank-account/phone exact-duplicate overlap from regex pipeline", () => {
    const bank = det(1, 50.06, 36.07, 14.44, 1.26);
    const phone = det(1, 50.06, 36.07, 14.44, 1.26);
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
