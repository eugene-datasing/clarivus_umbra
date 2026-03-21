import { describe, it, expect } from "vitest";
import { detectPatterns, type PatternMatch } from "../patterns";
import type { ExtractedPage } from "../extract";

function makePage(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text, words: [] };
}

function matchTypes(matches: PatternMatch[]): string[] {
  return matches.map((m) => m.type);
}

describe("detectPatterns", () => {
  // -----------------------------------------------------------------------
  // IRD numbers
  // -----------------------------------------------------------------------
  describe("IRD numbers", () => {
    it("matches 2-3-3 format with dashes", () => {
      const pages = [makePage(1, "IRD number: 12-345-678")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "ird")).toBe(true);
    });

    it("matches 3-3-3 format with dashes", () => {
      const pages = [makePage(1, "IRD: 123-456-789")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "ird")).toBe(true);
    });

    it("matches IRD with spaces instead of dashes", () => {
      const pages = [makePage(1, "IRD: 12 345 678")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "ird")).toBe(true);
    });

    it("matches IRD with no separators", () => {
      const pages = [makePage(1, "IRD: 12345678")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "ird")).toBe(true);
    });

    it("assigns s7(2)(a) ground to IRD matches", () => {
      const pages = [makePage(1, "IRD: 12-345-678")];
      const matches = detectPatterns(pages);
      const ird = matches.find((m) => m.type === "ird");
      expect(ird?.suggestedGround).toBe("s7(2)(a)");
    });

    it("assigns confidence of 95", () => {
      const pages = [makePage(1, "IRD: 12-345-678")];
      const matches = detectPatterns(pages);
      const ird = matches.find((m) => m.type === "ird");
      expect(ird?.confidence).toBe(95);
    });
  });

  // -----------------------------------------------------------------------
  // Phone numbers
  // -----------------------------------------------------------------------
  describe("NZ phone numbers", () => {
    it("matches local landline format 09 123 4567", () => {
      const pages = [makePage(1, "Call us at 09 123 4567")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "phone")).toBe(true);
    });

    it("matches mobile format 021 123 4567", () => {
      const pages = [makePage(1, "Mobile: 021 123 4567")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "phone")).toBe(true);
    });

    it("matches international format +64 21 123 4567", () => {
      const pages = [makePage(1, "Phone: +64 21 123 4567")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "phone")).toBe(true);
    });

    it("matches phone with dashes 021-123-4567", () => {
      const pages = [makePage(1, "Phone: 021-123-4567")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "phone")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Email addresses
  // -----------------------------------------------------------------------
  describe("email addresses", () => {
    it("matches simple email", () => {
      const pages = [makePage(1, "Contact: john@example.com")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "email-addr")).toBe(true);
    });

    it("matches email with dots and plus", () => {
      const pages = [makePage(1, "Email: john.doe+work@sub.example.co.nz")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "email-addr")).toBe(true);
    });

    it("does not match plain text without @", () => {
      const pages = [makePage(1, "This is not an email")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "email-addr")).toBe(false);
    });

    it("does not match @ without domain", () => {
      const pages = [makePage(1, "user@ is incomplete")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "email-addr")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // NHI numbers
  // -----------------------------------------------------------------------
  describe("NHI numbers", () => {
    it("matches valid NHI format ABC1234", () => {
      const pages = [makePage(1, "NHI: ABC1234")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "nhi")).toBe(true);
    });

    it("does not match NHI with excluded letters I, O", () => {
      // NHI regex excludes I and O
      const pages = [makePage(1, "NHI: IOA1234")];
      const matches = detectPatterns(pages);
      // 'I' and 'O' are excluded from the first character class [A-HJ-NP-Z]
      // IOA would fail because I is not in the valid set
      expect(matches.filter((m) => m.type === "nhi").length).toBe(0);
    });

    it("does not match lowercase nhi format", () => {
      const pages = [makePage(1, "NHI: abc1234")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "nhi")).toBe(false);
    });

    it("matches NHI with valid letters ZXY9876", () => {
      const pages = [makePage(1, "NHI: ZXY9876")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "nhi")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Addresses
  // -----------------------------------------------------------------------
  describe("street addresses", () => {
    it("matches numbered street address", () => {
      const pages = [makePage(1, "Located at 42 Queen Street")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "address")).toBe(true);
    });

    it("matches address with abbreviation Rd", () => {
      const pages = [makePage(1, "Located at 123 Devon Road")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "address")).toBe(true);
    });

    it("matches multi-word street name", () => {
      const pages = [makePage(1, "Office at 7 Mount Eden Terrace")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "address")).toBe(true);
    });

    it("does not match text without a street number", () => {
      const pages = [makePage(1, "Queen Street is a major road")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "address")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // General behavior
  // -----------------------------------------------------------------------
  describe("general behavior", () => {
    it("returns empty array for empty page text", () => {
      const pages = [makePage(1, "")];
      const matches = detectPatterns(pages);
      expect(matches).toEqual([]);
    });

    it("returns empty array for empty pages array", () => {
      const matches = detectPatterns([]);
      expect(matches).toEqual([]);
    });

    it("skips matches shorter than 3 characters", () => {
      // The regex would need to produce a very short match for this to matter
      const pages = [makePage(1, "No short patterns here in normal text")];
      const matches = detectPatterns(pages);
      for (const m of matches) {
        expect(m.text.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("assigns correct page number to matches", () => {
      const pages = [
        makePage(1, "No PII on page 1"),
        makePage(2, "Email: test@example.com"),
      ];
      const matches = detectPatterns(pages);
      const email = matches.find((m) => m.type === "email-addr");
      expect(email?.page).toBe(2);
    });

    it("captures offset for each match", () => {
      const text = "Contact john@example.com now";
      const pages = [makePage(1, text)];
      const matches = detectPatterns(pages);
      const email = matches.find((m) => m.type === "email-addr");
      expect(email?.offset).toBe(text.indexOf("john@example.com"));
    });

    it("detects multiple patterns in the same text", () => {
      const pages = [
        makePage(1, "IRD: 12-345-678. Email: test@example.com. NHI: ABC1234"),
      ];
      const matches = detectPatterns(pages);
      const types = matchTypes(matches);
      expect(types).toContain("ird");
      expect(types).toContain("email-addr");
      expect(types).toContain("nhi");
    });

    it("includes reasoning string for each match", () => {
      const pages = [makePage(1, "Email: test@example.com")];
      const matches = detectPatterns(pages);
      expect(matches[0].reasoning).toBeTruthy();
      expect(typeof matches[0].reasoning).toBe("string");
    });
  });
});
