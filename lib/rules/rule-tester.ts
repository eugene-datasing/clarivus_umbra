/**
 * Client-safe rule testing utility.
 *
 * Replicates the matching logic from lib/pipeline/custom-rules.ts without
 * server-side imports so it can be used in client components for testing
 * custom rules against sample text.
 */

export interface RuleTestMatch {
  start: number;
  end: number;
  text: string;
}

export interface RuleTestResult {
  matches: RuleTestMatch[];
  matchCount: number;
}

/**
 * Test a rule's keywords/pattern against sample text on the client side.
 *
 * Matching logic mirrors the server-side engine:
 * - Exact: word-boundary-aware case-insensitive search (\\b keyword \\b)
 * - Fuzzy: case-insensitive substring search
 * - Regex: user-supplied regex with global + case-insensitive flags
 *
 * Keywords are comma-separated for Exact and Fuzzy modes.
 * For Regex mode the entire string is treated as a single pattern.
 */
export function testRule(
  ruleKeywords: string,
  matchMode: string,
  sampleText: string,
): RuleTestResult {
  if (!ruleKeywords.trim() || !sampleText) {
    return { matches: [], matchCount: 0 };
  }

  if (matchMode === "Regex") {
    return testRegex(ruleKeywords, sampleText);
  }

  return testKeywords(ruleKeywords, matchMode, sampleText);
}

function testKeywords(
  ruleKeywords: string,
  matchMode: string,
  sampleText: string,
): RuleTestResult {
  const keywords = ruleKeywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    return { matches: [], matchCount: 0 };
  }

  const matches: RuleTestMatch[] = [];
  const isFuzzy = matchMode === "Fuzzy";
  const textLower = sampleText.toLowerCase();

  for (const keyword of keywords) {
    if (isFuzzy) {
      // Fuzzy: case-insensitive substring search
      const keywordLower = keyword.toLowerCase();
      let startIdx = 0;
      while (true) {
        const idx = textLower.indexOf(keywordLower, startIdx);
        if (idx === -1) break;
        matches.push({
          start: idx,
          end: idx + keyword.length,
          text: sampleText.substring(idx, idx + keyword.length),
        });
        startIdx = idx + keyword.length;
      }
    } else {
      // Exact: word-boundary-aware case-insensitive search
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let regex: RegExp;
      try {
        regex = new RegExp(`\\b${escaped}\\b`, "gi");
      } catch {
        continue;
      }
      for (const m of sampleText.matchAll(regex)) {
        if (m.index !== undefined) {
          matches.push({
            start: m.index,
            end: m.index + m[0].length,
            text: m[0],
          });
        }
      }
    }
  }

  // Sort by start position and deduplicate overlapping matches
  matches.sort((a, b) => a.start - b.start);

  return { matches, matchCount: matches.length };
}

function testRegex(
  pattern: string,
  sampleText: string,
): RuleTestResult {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "gi");
  } catch {
    // Invalid regex — return empty results rather than throwing
    return { matches: [], matchCount: 0 };
  }

  const matches: RuleTestMatch[] = [];

  for (const m of sampleText.matchAll(regex)) {
    if (m.index !== undefined) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
      });
    }
  }

  return { matches, matchCount: matches.length };
}
