/**
 * Regex-based pattern detection for New Zealand PII.
 *
 * Runs a set of curated regular expressions against extracted page text to
 * identify structured personal information such as IRD numbers, phone numbers,
 * email addresses, NHI numbers, and street addresses.
 *
 * Pattern matches are assigned a high confidence (95) because they are
 * deterministic.  Each pattern also carries a suggested LGOIMA withholding
 * ground.
 */

import type { ExtractedPage } from "./extract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatternMatch {
  /** Detection type label */
  type: string;
  /** The matched text */
  text: string;
  /** Confidence score (0-100) */
  confidence: number;
  /** 1-based page number where the match was found */
  page: number;
  /** Human-readable reasoning for the match */
  reasoning: string;
  /** Character offset of the match within the page text */
  offset: number;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PatternDef {
  type: string;
  regex: RegExp;
  reasoning: string;
  /**
   * Optional context-word guard. When set, a regex match is only accepted
   * if at least one of `words` appears within the `windowChars` characters
   * immediately before the match start. Used to disambiguate patterns
   * whose raw shape overlaps with another pattern (e.g. NZ driver licence
   * vs NZ passport).
   */
  requireContext?: {
    words: string[];
    windowChars: number;
  };
}

/**
 * Security note: the word list passed in is expected to be code-defined
 * (from PatternDef.requireContext). If this function is ever called with
 * dynamic / user-supplied words, each word must be regex-escaped before
 * interpolation to prevent injection (e.g. a word like "DL|.*" would
 * silently match everything). Current use is safe.
 */
/**
 * Returns true iff any word in `words` appears, as a whole word, inside
 * the `windowChars` characters immediately BEFORE `matchStart` in `text`.
 * Case-insensitive. Uses a fresh per-call RegExp (no shared /g state).
 */
export function hasContextWithin(
  text: string,
  matchStart: number,
  words: string[],
  windowChars: number,
): boolean {
  if (words.length === 0 || windowChars <= 0 || matchStart <= 0) return false;
  const windowStart = Math.max(0, matchStart - windowChars);
  const windowText = text.slice(windowStart, matchStart);
  for (const word of words) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(windowText)) return true;
  }
  return false;
}

// Patterns are ordered from most specific to least specific so that longer,
// more precise matches (e.g. bank account) claim their character spans before
// shorter, greedier patterns (e.g. phone) can grab substrings.
const PATTERNS: PatternDef[] = [
  {
    type: "bank-account",
    // NZ bank account: BB-bbbb-AAAAAAA-SS (bank-branch-account-suffix).
    // Must run before phone/IRD to prevent partial matches.
    regex: /\b\d{2}[-\s]?\d{4}[-\s]?\d{6,8}[-\s]?\d{2,3}\b/g,
    reasoning:
      "Matches an NZ bank account number pattern (bank-branch-account-suffix). Bank account numbers are sensitive financial identifiers that should be withheld to protect privacy.",
  },
  {
    type: "ird",
    // 8-digit (XX-XXX-XXX) or 9-digit (XXX-XXX-XXX) IRD numbers.
    // Negative lookahead excludes NZ mobile prefixes (02x) which overlap
    // in 3-3-3 format (e.g. 021 544 908 is a cellphone, not an IRD).
    regex: /\b(?!02[0-9][-\s]?\d{3}[-\s]?\d{3}\b)\d{2,3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
    reasoning:
      "Matches an NZ IRD number pattern. IRD numbers are sensitive personal identifiers that should be withheld to protect individual privacy.",
  },
  {
    type: "phone",
    // NZ phone numbers starting with +64, 64, or 0.
    // Negative lookbehind rejects matches preceded by a digit or hyphen,
    // preventing partial matches inside bank account numbers or other
    // numeric identifiers (e.g. "0789123-00" inside "12-3056-0789123-00").
    // Parentheses around the area code (e.g. "(06) 759 2217") are allowed
    // as separators inside the digit group and optionally wrapping the
    // prefix. Phase 1 item 1 of docs/detection-coverage-plan-2026-04.md.
    regex: /(?<![0-9-])\(?(?:\+?64|0)\)?[\s)(-]*(?:\d[\s)(-]*){7,9}(?![0-9-])/g,
    reasoning:
      "Matches a New Zealand phone number pattern. Personal phone numbers should generally be withheld to protect privacy unless they are published contact details for a public official acting in their official capacity.",
  },
  {
    type: "email-addr",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    reasoning:
      "Matches an email address. Personal email addresses should be withheld to protect privacy. Official/published addresses may not require redaction.",
  },
  {
    type: "nhi",
    regex: /\b[A-HJ-NP-Z]{3}\d{4}\b/g,
    reasoning:
      "Matches an NZ National Health Index (NHI) number. NHI numbers are sensitive health identifiers and must be withheld.",
  },
  {
    type: "address",
    regex:
      /\b\d{1,5}[ \t]+[A-Z][a-z]{2,}(?:[ \t]+[A-Z][a-z]{2,})*[ \t]+(?:Street|Road|Avenue|Drive|Place|Terrace|Crescent|Lane|Way|Close|Court|St|Rd|Ave|Dr|Pl|Tce|Cres|Ln|Cl|Ct)\b/gi,
    reasoning:
      "Matches a New Zealand street address. Personal residential addresses should be withheld to protect privacy.",
  },
  {
    // Must precede nz-passport: DL shape (2 letters excluding I/O + 6 digits)
    // is a proper subset of the passport shape. With the context-word guard,
    // DL only claims the span when a licence keyword sits just before the
    // token; otherwise the match is skipped (range not claimed) and
    // nz-passport gets its normal shot at the same span.
    type: "nz-driver-licence",
    regex: /\b[A-HJ-NP-Z]{2}\d{6}\b/g,
    requireContext: {
      words: ["licence", "license", "driver", "DL"],
      windowChars: 40,
    },
    reasoning:
      "NZ driver licence number (2 letters + 6 digits, I and O excluded) with required context keyword nearby.",
  },
  {
    type: "nz-passport",
    regex: /\b[A-Z]{2}\d{6}\b/g,
    reasoning:
      "Matches an NZ passport number pattern (two letters followed by six digits). Passport numbers are sensitive identity documents that must be withheld.",
  },
  {
    type: "vehicle-reg",
    regex: /\b[A-Z]{3}\d{3,4}\b/g,
    reasoning:
      "Matches an NZ vehicle registration plate pattern. Vehicle registrations can be used to identify individuals and should be withheld.",
  },
];

// ---------------------------------------------------------------------------
// Detection function
// ---------------------------------------------------------------------------

/**
 * Run regex patterns against the extracted pages and return an array of
 * matches.  When `enabledTypes` is provided, only patterns whose type is
 * in the set will run.  NHI is always included (no toggle — always sensitive).
 *
 * @param pages - The pages produced by the text extraction step.
 * @param enabledTypes - Optional set of enabled detection type keys.
 * @returns An array of pattern matches across all pages.
 */
export function detectPatterns(
  pages: ExtractedPage[],
  enabledTypes?: Set<string>,
): PatternMatch[] {
  const activePatterns = enabledTypes
    ? PATTERNS.filter((p) => p.type === "nhi" || enabledTypes.has(p.type))
    : PATTERNS;

  const matches: PatternMatch[] = [];

  for (const page of pages) {
    if (!page.text) continue;

    // Track occupied character ranges on this page so that the same text
    // span cannot be claimed by multiple pattern types.
    const occupied: { start: number; end: number }[] = [];

    for (const pattern of activePatterns) {
      // Use matchAll to iterate over all regex matches in the page text
      const allMatches = page.text.matchAll(pattern.regex);

      for (const m of allMatches) {
        const matchedText = m[0].trim();

        // Skip very short or obviously invalid matches
        if (matchedText.length < 3) continue;

        const start = m.index ?? 0;
        const end = start + m[0].length;

        // Context-word guard. Checked BEFORE the overlap test so a failed
        // context check never claims the range — a subsequent pattern with
        // looser rules (e.g. nz-passport) still gets to fire on the span.
        if (
          pattern.requireContext &&
          !hasContextWithin(
            page.text,
            start,
            pattern.requireContext.words,
            pattern.requireContext.windowChars,
          )
        ) {
          continue;
        }

        // Skip if this span overlaps with a match from an earlier pattern
        const overlaps = occupied.some(
          (r) => start < r.end && end > r.start,
        );
        if (overlaps) continue;

        occupied.push({ start, end });
        matches.push({
          type: pattern.type,
          text: matchedText,
          confidence: 95,
          page: page.pageNumber,
          reasoning: pattern.reasoning,
          offset: start,
        });
      }
    }
  }

  return matches;
}
