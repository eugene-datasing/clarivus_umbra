/**
 * Custom Rules Execution Engine — WP8
 *
 * Runs user-defined keyword/pattern rules against extracted text.
 * Called after built-in pattern detection in the processing pipeline.
 */

import { getActiveRules, incrementMatchCount } from "@/lib/data/rules";
import { logger } from "@/lib/logger";

export interface CustomRuleMatch {
  ruleId: string;
  ruleName: string;
  type: string;
  text: string;
  page: number;
  confidence: number;
  reasoning: string;
}

interface PageInput {
  pageNumber: number;
  text: string;
}

/**
 * Run all active custom rules against extracted pages.
 */
export async function executeCustomRules(
  pages: PageInput[],
): Promise<CustomRuleMatch[]> {
  const rules = await getActiveRules();
  if (rules.length === 0) return [];

  const matches: CustomRuleMatch[] = [];

  for (const rule of rules) {
    const ruleMatches = runRule(rule, pages);
    if (ruleMatches.length > 0) {
      matches.push(...ruleMatches);
      // Update match count in background (non-blocking)
      incrementMatchCount(rule.id, ruleMatches.length).catch(() => {});
    }
  }

  return matches;
}

function runRule(
  rule: {
    id: string;
    name: string;
    type: string;
    matchMode: string;
    keywords: string;
  },
  pages: PageInput[],
): CustomRuleMatch[] {
  if (!rule.keywords.trim()) return [];

  if (rule.matchMode === "Regex") {
    return runRegexRule(rule, pages);
  }

  // Keyword-based (Exact or Fuzzy)
  return runKeywordRule(rule, pages);
}

function runKeywordRule(
  rule: {
    id: string;
    name: string;
    type: string;
    matchMode: string;
    keywords: string;
  },
  pages: PageInput[],
): CustomRuleMatch[] {
  const keywords = rule.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (keywords.length === 0) return [];

  const matches: CustomRuleMatch[] = [];
  const isFuzzy = rule.matchMode === "Fuzzy";

  for (const page of pages) {
    const pageText = page.text;
    const pageTextLower = pageText.toLowerCase();

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();

      if (isFuzzy) {
        // Fuzzy: case-insensitive substring search
        let startIdx = 0;
        while (true) {
          const idx = pageTextLower.indexOf(keywordLower, startIdx);
          if (idx === -1) break;
          const matchedText = pageText.substring(idx, idx + keyword.length);
          matches.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: `custom-${rule.type.toLowerCase()}`,
            text: matchedText,
            page: page.pageNumber,
            confidence: 75,
            reasoning: `Custom rule "${rule.name}" (fuzzy match)`,
          });
          startIdx = idx + keyword.length;
        }
      } else {
        // Exact: word-boundary-aware case-insensitive search
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "gi");
        for (const m of pageText.matchAll(regex)) {
          matches.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: `custom-${rule.type.toLowerCase()}`,
            text: m[0],
            page: page.pageNumber,
            confidence: 90,
            reasoning: `Custom rule "${rule.name}" (exact match)`,
          });
        }
      }
    }
  }

  return matches;
}

function runRegexRule(
  rule: {
    id: string;
    name: string;
    type: string;
    keywords: string;
  },
  pages: PageInput[],
): CustomRuleMatch[] {
  let regex: RegExp;
  try {
    regex = new RegExp(rule.keywords, "gi");
  } catch {
    logger.warn(`[custom-rules] Invalid regex in rule "${rule.name}": ${rule.keywords}`);
    return [];
  }

  const matches: CustomRuleMatch[] = [];

  for (const page of pages) {
    for (const m of page.text.matchAll(regex)) {
      matches.push({
        ruleId: rule.id,
        ruleName: rule.name,
        type: `custom-${rule.type.toLowerCase()}`,
        text: m[0],
        page: page.pageNumber,
        confidence: 85,
        reasoning: `Custom rule "${rule.name}" (regex match)`,
      });
    }
  }

  return matches;
}
