/**
 * Entity propagation pass (Phase 4 of the April 2026 detection-coverage
 * plan; trimmed in Phase 12.1 — Umbra v2 — to personal-name only).
 *
 * After AI detection, take each seed detection that refers to a person
 * (type `personal-name`) and search the rest of the document for
 * additional occurrences — full name, honorific + surname, and bare
 * surname — emitting one propagated detection per match. This lifts
 * bare-surname and honorific-variant recall on documents where the AI
 * anchors the name once but misses subsequent mentions; B1's in-prose
 * "Ms Ferguson" / "Ferguson" across pages 2-3 is the motivating case.
 *
 * Phase 12.1 (Umbra v2) note: pre-rip the propagator also seeded off
 * `harassment-risk` (the LGOIMA-era witness-in-grievance type). v2
 * drops that type entirely — names that previously routed there will
 * now be typed `personal-name` directly by the rewritten AI prompt, so
 * a single seed-type covers the same coverage surface.
 *
 * Design:
 *   - Seed type: `personal-name` only.
 *   - Propagated detections carry the seed's type and explanation; the
 *     source is always `"entity-propagation"`.
 *   - Variants generated per seed:
 *       - The full seed text itself (for re-occurrences on other pages).
 *       - Honorific + surname for each title in KNOWN_TITLES.
 *       - Bare surname, IFF all of:
 *           - surname length >= 5 characters
 *           - surname lowercased not in SURNAME_DENYLIST
 *     NOT generated:
 *       - First-name alone (ambiguous in isolation).
 *       - First-name + surname when seed is honorific + surname (no
 *         cross-doc first-name lookup; kept simple on purpose).
 *   - Search: word-boundary regex, case-sensitive first letter (so
 *     "smith" in "a smith at the forge" does not match a "Smith"
 *     variant). One propagated detection emitted per (variant, page)
 *     — if the variant appears N times on the same page, one detection
 *     is produced. This matches the AI's flag-once pattern:
 *     calculateBBoxAll downstream expands a single detection into N
 *     bbox-enriched rows for per-occurrence redaction. Emitting N
 *     propagated detections would double-multiply against that
 *     expansion and inflate false positives against the bench's
 *     first-match-wins scorer.
 *   - Overlap with the seed's own text is rejected: a variant whose
 *     character range overlaps any occurrence of the seed text on the
 *     seed's own page is not re-emitted.
 *
 * Pure function, no I/O. Unit-tested in `__tests__/entity-propagation.test.ts`.
 */

import { SURNAME_DENYLIST, KNOWN_TITLES } from "./stopwords";
import type { ExtractedPage } from "./extract";

/**
 * Seed shape matches the unified-detection shape that process.ts
 * builds from AI + pattern + custom-rule outputs. Only the fields
 * we consume are listed; the propagator ignores any extras.
 */
export interface PropagationSeed {
  type: string;
  text: string;
  page: number;
  reasoning: string;
  aiExplanation: string;
  source: string;
}

export interface PropagatedDetection {
  type: string; // carried from seed
  text: string; // the matched variant
  confidence: number;
  page: number; // page of the match (not the seed's page)
  reasoning: string;
  aiExplanation: string;
  source: "entity-propagation";
  seedType: "personal-name";
  seedText: string;
}

const SEED_TYPES = new Set(["personal-name"]);
const MIN_BARE_SURNAME_LENGTH = 5;
const PROPAGATED_CONFIDENCE = 85;

interface ParsedSeed {
  surname: string;
  firstAndMiddles: string[]; // empty if seed is title-only + surname or just surname
  hasTitle: boolean;
}

function parseSeedText(text: string): ParsedSeed | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Strip known title prefix. Accept with or without trailing dot,
  // case-insensitive.
  const normalisedFirst = tokens[0].replace(/\.$/, "").toLowerCase();
  const hasTitle = KNOWN_TITLES.some((t) => t.toLowerCase() === normalisedFirst);
  const nameTokens = hasTitle ? tokens.slice(1) : tokens;

  if (nameTokens.length === 0) return null;

  const surname = nameTokens[nameTokens.length - 1];
  const firstAndMiddles = nameTokens.slice(0, -1);

  // Reject anything that doesn't look like a proper-noun name:
  // the surname must start with an uppercase letter.
  if (!/^[A-Z]/.test(surname)) return null;

  return { surname, firstAndMiddles, hasTitle };
}

function shouldEmitBareSurname(surname: string): boolean {
  if (surname.length < MIN_BARE_SURNAME_LENGTH) return false;
  if (SURNAME_DENYLIST.has(surname.toLowerCase())) return false;
  return true;
}

/**
 * Build the list of variant strings to search for, given a parsed
 * seed. Returns unique variants; the original seed text is included
 * to catch re-occurrences on pages other than the seed's.
 */
function generateVariants(parsed: ParsedSeed, seedText: string): string[] {
  const variants = new Set<string>();

  // The full original seed text — catches re-occurrences of the exact
  // string (e.g. "Melissa Ferguson" appears twice in the document).
  variants.add(seedText);

  // "FirstName SurName" reconstructed without title — covers seeds
  // like "Dr Sarah Liang" where the full body reference is "Sarah
  // Liang" without the title.
  if (parsed.firstAndMiddles.length > 0) {
    variants.add([...parsed.firstAndMiddles, parsed.surname].join(" "));
  }

  // Every title + surname combination. The AI may have anchored on
  // "Melissa Ferguson" but the body uses "Ms Ferguson" — we want the
  // honorific forms regardless of whether the seed had one.
  for (const title of KNOWN_TITLES) {
    variants.add(`${title} ${parsed.surname}`);
  }

  // Bare surname, subject to the precision guard.
  if (shouldEmitBareSurname(parsed.surname)) {
    variants.add(parsed.surname);
  }

  return [...variants];
}

/**
 * Escape a string for safe use inside a regex pattern.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-sensitive search with word-boundary anchors on each side.
 * Returns the character-offset ranges of every non-overlapping match
 * of `variant` in `pageText`.
 */
function findMatchRanges(pageText: string, variant: string): Array<{ start: number; end: number }> {
  const pattern = new RegExp(`\\b${escapeRegex(variant)}\\b`, "g");
  const ranges: Array<{ start: number; end: number }> = [];
  for (const m of pageText.matchAll(pattern)) {
    if (m.index === undefined) continue;
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

/**
 * Check whether a match range overlaps the seed detection's own
 * position on the same page. Because we do not know the seed's
 * character offset in the page text (it arrives with only `page`
 * and `text`), we use a text-containment heuristic: the seed text
 * appears somewhere on the seed's page; any variant match whose span
 * lies inside that seed occurrence is skipped.
 *
 * This is deliberately loose — if the seed text appears multiple
 * times on the seed page, all of those are treated as "the seed" and
 * re-emission is suppressed. That's fine: the AI already flagged the
 * first one, process.ts's dedup handles the rest.
 */
function overlapsSeed(
  pageText: string,
  matchStart: number,
  matchEnd: number,
  seedText: string,
): boolean {
  let idx = pageText.indexOf(seedText);
  while (idx !== -1) {
    const seedStart = idx;
    const seedEnd = idx + seedText.length;
    if (matchStart < seedEnd && matchEnd > seedStart) return true;
    idx = pageText.indexOf(seedText, idx + 1);
  }
  return false;
}

/**
 * Main propagation entry point. Iterates eligible seeds, generates
 * variants, and searches each page's text for non-overlapping
 * matches. Emits one PropagatedDetection per match.
 *
 * @param pages - extracted pages with `.text` and `.pageNumber`.
 * @param detections - the full unified detection list from process.ts
 *                     (pattern + AI + custom-rule merged). The function
 *                     filters internally to the two seed types.
 */
export function propagateNameDetections(
  pages: ExtractedPage[],
  detections: PropagationSeed[],
): PropagatedDetection[] {
  // Unique (type|text|page) entries. One propagated detection per
  // variant per page regardless of how many non-overlapping matches
  // the variant has on that page — calculateBBoxAll expands a single
  // detection to per-occurrence bboxes downstream.
  const emitted = new Map<string, PropagatedDetection>();

  for (const seed of detections) {
    if (!SEED_TYPES.has(seed.type)) continue;
    const parsed = parseSeedText(seed.text);
    if (!parsed) continue;

    const seedType = seed.type as "personal-name";
    const variants = generateVariants(parsed, seed.text);

    for (const variant of variants) {
      for (const page of pages) {
        const pageText = page.text ?? "";
        if (!pageText) continue;
        const ranges = findMatchRanges(pageText, variant);
        if (ranges.length === 0) continue;

        // Decide whether any of the matches on this page are
        // *non-overlapping* with the seed occurrence on the seed's own
        // page. If every match is an overlap with the seed, skip the
        // whole (variant, page) tuple.
        let hasCleanMatch = false;
        if (page.pageNumber !== seed.page) {
          hasCleanMatch = true;
        } else {
          for (const { start, end } of ranges) {
            if (!overlapsSeed(pageText, start, end, seed.text)) {
              hasCleanMatch = true;
              break;
            }
          }
        }
        if (!hasCleanMatch) continue;

        const key = `${seedType}|${variant.toLowerCase()}|${page.pageNumber}`;
        if (emitted.has(key)) continue;

        emitted.set(key, {
          type: seedType,
          text: variant,
          confidence: PROPAGATED_CONFIDENCE,
          page: page.pageNumber,
          reasoning: `Entity propagation from seed "${seed.text}" (originally detected on page ${seed.page}).`,
          aiExplanation: `Propagated from "${seed.text}" (seed type ${seedType}, seed source ${seed.source}). The seed was identified on page ${seed.page}; this variant was found on page ${page.pageNumber} by deterministic word-boundary search.`,
          source: "entity-propagation",
          seedType,
          seedText: seed.text,
        });
      }
    }
  }

  return [...emitted.values()];
}
