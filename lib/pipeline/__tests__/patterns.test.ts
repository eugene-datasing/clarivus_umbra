import { describe, it, expect } from "vitest";
import { detectPatterns, hasContextWithin, type PatternMatch } from "../patterns";
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

    it("assigns confidence of 95", () => {
      const pages = [makePage(1, "IRD: 12-345-678")];
      const matches = detectPatterns(pages);
      const ird = matches.find((m) => m.type === "ird");
      expect(ird?.confidence).toBe(95);
    });

    it("does not match NZ mobile number 021 544 908 as IRD", () => {
      const pages = [makePage(1, "Mobile: 021 544 908")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "ird")).toBe(false);
      expect(matches.some((m) => m.type === "phone")).toBe(true);
    });

    it("does not match 027 prefix as IRD", () => {
      const pages = [makePage(1, "Phone: 027-123-456")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "ird")).toBe(false);
    });

    it("does not match 022 prefix as IRD", () => {
      const pages = [makePage(1, "Call 022 456 789")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "ird")).toBe(false);
    });

    it("still matches non-02x 3-digit prefixed IRDs", () => {
      const pages = [makePage(1, "IRD: 123-456-789")];
      const matches = detectPatterns(pages);
      expect(matches.some((m) => m.type === "ird")).toBe(true);
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

    // -------------------------------------------------------------------
    // Parenthesised area codes — Phase 1 item 1 fix (Hypothesis A).
    // Before: /(?<![0-9-])(?:\+?64|0)[\s-]?(?:\d[\s-]?){7,9}(?![0-9-])/g
    //   failed on (06) 759 2217 because ")" wasn't in the separator class.
    // After: parens allowed as separators, and optionally wrapping prefix.
    // -------------------------------------------------------------------

    it("matches (06) 759 2217 — parenthesised area code, space separators", () => {
      const pages = [makePage(1, "GP: Dr Sarah Liang (06) 759 2217")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
    });

    it("matches (04) 123 4567 — Wellington public-service style", () => {
      const pages = [makePage(1, "Helpline (04) 123 4567 weekdays")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
    });

    it("matches +64 (6) 759 2217 — international with parens around area code", () => {
      const pages = [makePage(1, "International: +64 (6) 759 2217")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
    });

    it("matches 06 759 2217 — regression guard, space-separated no parens", () => {
      const pages = [makePage(1, "Phone: 06 759 2217")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
    });

    it("matches 06-759-2217 — regression guard, hyphenated", () => {
      const pages = [makePage(1, "Phone: 06-759-2217")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
    });

    it("matches +64 6 759 2217 — regression guard, international with spaces", () => {
      const pages = [makePage(1, "Phone: +64 6 759 2217")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
    });

    it("matches 027 123 4567 — regression guard, mobile 027", () => {
      const pages = [makePage(1, "Mobile: 027 123 4567")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
    });

    it("matches 021 123 4567 — regression guard, mobile 021", () => {
      const pages = [makePage(1, "Mobile: 021 123 4567")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
    });

    it("does NOT match raw 10 digits 1234567890 — no NZ prefix or separators", () => {
      const pages = [makePage(1, "Reference 1234567890 on file.")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(0);
    });

    it("does NOT match 12-345-678 as a phone — IRD shape, disambiguation", () => {
      const pages = [makePage(1, "IRD: 12-345-678")];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(0);
    });

    it("matches the full landline in prose — 'contactable on (06) 759 2217 between 9am and 5pm'", () => {
      const pages = [
        makePage(1, "contactable on (06) 759 2217 between 9am and 5pm"),
      ];
      const matches = detectPatterns(pages).filter((m) => m.type === "phone");
      expect(matches.length).toBe(1);
      // The captured text should contain the area-code digits and the
      // seven-digit subscriber block so the downstream redactor covers
      // the whole phone number, not just a suffix.
      expect(matches[0].text).toContain("06");
      expect(matches[0].text).toContain("759");
      expect(matches[0].text).toContain("2217");
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

  // -----------------------------------------------------------------------
  // NZ driver licence — pattern with requireContext guard
  // -----------------------------------------------------------------------
  describe("NZ driver licence", () => {
    it("classifies HM847219 as driver-licence when 'Licence' precedes it in window", () => {
      const pages = [makePage(1, "NZ Driver Licence HM847219")];
      const matches = detectPatterns(pages);
      const types = matchTypes(matches);
      expect(types).toContain("nz-driver-licence");
      expect(types).not.toContain("nz-passport");
    });

    it("classifies LA123456 as nz-passport when no DL context is present", () => {
      const pages = [makePage(1, "Passport no. LA123456")];
      const matches = detectPatterns(pages);
      const types = matchTypes(matches);
      expect(types).toContain("nz-passport");
      expect(types).not.toContain("nz-driver-licence");
    });

    it("falls back to nz-passport on an ID-shaped token without DL context", () => {
      // No 'licence' / 'driver' / 'DL' within the 40-char window: DL match
      // fails the context guard, does not claim the range, and nz-passport
      // fires on the same span.
      const pages = [makePage(1, "Reference number HM847219 on file.")];
      const matches = detectPatterns(pages);
      const types = matchTypes(matches);
      expect(types).toContain("nz-passport");
      expect(types).not.toContain("nz-driver-licence");
    });
  });
});

// -----------------------------------------------------------------------
// hasContextWithin — helper used by PatternDef.requireContext
// -----------------------------------------------------------------------
describe("hasContextWithin", () => {
  it("returns true when a context word sits inside the window before matchStart", () => {
    const text = "NZ Driver Licence HM847219";
    const matchStart = text.indexOf("HM847219");
    expect(hasContextWithin(text, matchStart, ["licence"], 40)).toBe(true);
  });

  it("returns false when no context word appears in the window", () => {
    const text = "Reference number HM847219 on file.";
    const matchStart = text.indexOf("HM847219");
    expect(hasContextWithin(text, matchStart, ["licence", "driver", "DL"], 40)).toBe(false);
  });

  it("returns false when the context word sits beyond the window", () => {
    // 100-char filler pushes 'licence' well past the 20-char window.
    const filler = "x".repeat(100);
    const text = `The licence is mentioned far away, then ${filler} HM847219`;
    const matchStart = text.indexOf("HM847219");
    expect(hasContextWithin(text, matchStart, ["licence"], 20)).toBe(false);
  });

  it("matches case-insensitively", () => {
    const text = "NZ DRIVER LICENCE HM847219";
    const matchStart = text.indexOf("HM847219");
    expect(hasContextWithin(text, matchStart, ["licence"], 40)).toBe(true);
  });
});
