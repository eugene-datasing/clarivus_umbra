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
  /** Suggested LGOIMA withholding ground */
  suggestedGround: string;
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
  suggestedGround: string;
  reasoning: string;
}

const PATTERNS: PatternDef[] = [
  {
    type: "ird",
    regex: /\b\d{2,3}[-\s]?\d{3}[-\s]?\d{3}\b/g,
    suggestedGround: "s7_2a",
    reasoning:
      "Matches an NZ IRD number pattern. IRD numbers are sensitive personal identifiers that should be withheld to protect individual privacy.",
  },
  {
    type: "phone",
    regex: /\b(?:\+?64|0)[\s-]?(?:\d[\s-]?){7,9}\b/g,
    suggestedGround: "s7_2a",
    reasoning:
      "Matches a New Zealand phone number pattern. Personal phone numbers should generally be withheld to protect privacy unless they are published contact details for a public official acting in their official capacity.",
  },
  {
    type: "email-addr",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    suggestedGround: "s7_2a",
    reasoning:
      "Matches an email address. Personal email addresses should be withheld to protect privacy. Official/published addresses may not require redaction.",
  },
  {
    type: "nhi",
    regex: /\b[A-HJ-NP-Z]{3}\d{4}\b/g,
    suggestedGround: "s7_2a",
    reasoning:
      "Matches an NZ National Health Index (NHI) number. NHI numbers are sensitive health identifiers and must be withheld.",
  },
  {
    type: "address",
    regex:
      /\b\d{1,5}[ \t]+[A-Z][a-z]{2,}(?:[ \t]+[A-Z][a-z]{2,})*[ \t]+(?:Street|Road|Avenue|Drive|Place|Terrace|Crescent|Lane|Way|Close|Court|St|Rd|Ave|Dr|Pl|Tce|Cres|Ln|Cl|Ct)\b/gi,
    suggestedGround: "s7_2a",
    reasoning:
      "Matches a New Zealand street address. Personal residential addresses should be withheld to protect privacy.",
  },
  {
    type: "bank-account",
    regex: /\b\d{2}[-\s]?\d{4}[-\s]?\d{6,8}[-\s]?\d{2,3}\b/g,
    suggestedGround: "s7_2a",
    reasoning:
      "Matches an NZ bank account number pattern (bank-branch-account-suffix). Bank account numbers are sensitive financial identifiers that should be withheld to protect privacy.",
  },
  {
    type: "nz-passport",
    regex: /\b[A-Z]{2}\d{6}\b/g,
    suggestedGround: "s7_2a",
    reasoning:
      "Matches an NZ passport number pattern (two letters followed by six digits). Passport numbers are sensitive identity documents that must be withheld.",
  },
  {
    type: "vehicle-reg",
    regex: /\b[A-Z]{3}\d{3,4}\b/g,
    suggestedGround: "s7_2a",
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

    for (const pattern of activePatterns) {
      // Use matchAll to iterate over all regex matches in the page text
      const allMatches = page.text.matchAll(pattern.regex);

      for (const m of allMatches) {
        const matchedText = m[0].trim();

        // Skip very short or obviously invalid matches
        if (matchedText.length < 3) continue;

        matches.push({
          type: pattern.type,
          text: matchedText,
          confidence: 95,
          page: page.pageNumber,
          suggestedGround: pattern.suggestedGround,
          reasoning: pattern.reasoning,
          offset: m.index ?? 0,
        });
      }
    }
  }

  return matches;
}
