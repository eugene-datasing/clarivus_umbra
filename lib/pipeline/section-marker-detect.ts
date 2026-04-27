/**
 * Section-marker detection (April 2026 — free-frank coverage gap fix
 * for Bug 5 follow-up; investigation report in this branch's
 * commit history).
 *
 * Deterministic regex pass that flags every prose-shaped sentence
 * inside a section whose header marks the section as `(free and
 * frank)` / `candid commentary` / similar — content the LGOIMA
 * grounds dictionary maps to s7(2)(f)(i). Mirrors the Phase 5
 * `lib/pipeline/label-adjacent.ts` shape: pre-AI deterministic pass,
 * orthogonal to the AI's per-sentence judgement, feeds into the same
 * merge → bbox → dedup flow as every other detection source.
 *
 * Why this exists. The April retrospective documented a structural
 * prompt-engineering ceiling on free-frank vs harassment-risk vs
 * legal-privilege vs confidential ambiguous-type sentence content
 * (see docs/detection-coverage-retrospective-2026-04.md, "ambiguous-
 * type sentence content" mechanism). The AI catches one or two
 * sentences per (free and frank) section and abstains on the rest.
 * Eugene's diagnosis report on B1 confirmed the symptom: 1 of 6
 * expected free-frank entries detected. This pass is the
 * deterministic backstop — when a section header explicitly cites
 * free-and-frank framing, every prose sentence inside the section
 * body is a free-frank candidate.
 *
 * Scope. Free-frank only in v1. Section markers for "without
 * prejudice" / "in confidence" / "privileged advice" are out of
 * scope here — those touch legal-privilege territory where the
 * Phase 6-parked schema-migration mechanism applies and a separate
 * design pass is needed.
 *
 * Non-goals. This pass does NOT try to summarise the section into a
 * single detection, does NOT replicate the AI's nuanced procedural-
 * vs-opinion judgement (the FP-guards are deliberately conservative
 * — better to under-flag than scoop up procedural lines), and does
 * NOT auto-accept (status stays `pending`; the reviewer confirms
 * each sentence).
 */

import type { ExtractedPage } from "./extract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectionMarkerMatch {
  type: string;
  text: string;
  confidence: number;
  page: number;
  suggestedGround: string;
  appliedGround: string;
  reasoning: string;
  /** Which section-marker pattern fired, for audit trail. */
  markerMatched: string;
  /** Character offset of the captured sentence in the page text. */
  offset: number;
}

// ---------------------------------------------------------------------------
// Section-header marker dictionary (Phase 1 §2)
// ---------------------------------------------------------------------------

/**
 * Each entry's regex is matched line-by-line, case-insensitive, so
 * patterns are written to match a single line's worth of header text.
 * The header line itself is NOT a body candidate — only lines BELOW
 * the header up to the section-end terminator (§3 in the design)
 * become candidates.
 */
interface MarkerEntry {
  /** Compiled per-line case-insensitive regex. Tested with `.test()`. */
  regex: RegExp;
  /** Short human label for the audit trail (`markerMatched`). */
  label: string;
  /**
   * Strong patterns (parentheticals like `(free and frank)`) match
   * unambiguously as section markers — they don't appear in prose.
   *
   * Weak patterns (freeform "free and frank" / "candid commentary" /
   * "s7(2)(f)") DO appear in prose ("the officer's candid view is
   * that…", "this would chill candour (s7(2)(f))"). For weak
   * patterns we require an additional header-shape check (line is
   * short and doesn't end with a sentence-terminating period) before
   * treating the line as a section opener.
   */
  strong: boolean;
}

const MARKER_DICTIONARY: MarkerEntry[] = [
  // 1. Parenthetical "(free and frank)" — strongest signal. Doesn't
  //    appear in prose; always a header annotation.
  {
    regex: /\(\s*free\s+and\s+frank\s*\)/i,
    label: "(free and frank)",
    strong: true,
  },
  // 2. Bare "free and frank" inline — appears in prose too ("a
  //    free and frank exchange of views"). Requires header-shape
  //    check.
  {
    regex: /\bfree\s+and\s+frank\b/i,
    label: "free and frank",
    strong: false,
  },
  // 3. Candid commentary / review / opinion / advice / view /
  //    appraisal / assessment, optionally preceded by an actor noun.
  //    Appears in prose — "the officer's candid view is that…".
  //    Requires header-shape check.
  {
    regex:
      /\bcandid\s+(?:investigator\s+|officer\s+|reviewer\s+|advisor\s+)?(?:commentary|review|opinion|advice|view|appraisal|assessment)\b/i,
    label: "candid commentary",
    strong: false,
  },
  // 4. Parenthetical "(candid)" — short-form, header-only.
  {
    regex: /\(\s*candid\s*\)/i,
    label: "(candid)",
    strong: true,
  },
  // Statutory-ground-only headers (e.g. a section titled solely
  // "s7(2)(f)") were considered as a fifth pattern but dropped from
  // v1: B1's actual extraction has "...if it were released
  // (s7(2)(f)):" mid-prose where the parenthetical citation would
  // wrongly open a new section, splitting the self-justification
  // paragraph (Eugene's clarification 2) away from its body. The
  // colloquial naming patterns above cover the common cases — every
  // (free and frank) section in the dev DB and test fixtures uses
  // the parenthetical or "candid commentary" form. Statutory-only
  // headers can be added as a follow-up if they show up in
  // production.
];

/**
 * Header-shape heuristic for weak markers: the line must be short
 * AND must not end with a sentence-terminating period followed by
 * end-of-line. Matches every header in the test fixtures (all under
 * 50 chars, none terminated by a period); rejects body sentences
 * which run 60+ chars and end with `.`.
 */
const HEADER_SHAPE_MAX_LENGTH = 80;

function looksLikeHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > HEADER_SHAPE_MAX_LENGTH) return false;
  // Sentence-terminating period (`.`, `?`, `!`) at the end of the
  // trimmed line indicates prose, not a heading. Allow a trailing
  // colon (`:`) — a common header punctuation in council documents.
  if (/[.?!]$/.test(trimmed)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Section-end terminator (Phase 1 §3)
// ---------------------------------------------------------------------------

/**
 * A line is a section-end terminator if it matches:
 *   - a numbered section header (`1.`, `1)`, `1.1`),
 *   - a roman-numeral header (`I.`, `II.`),
 *   - an ALL-CAPS header (≥5 chars to avoid initialism stubs like
 *     `HR-INV-2026-018`), or
 *   - one of the canonical post-section header keywords
 *     (`Recommendations`, `Conclusion`, `Signed`, `Date`, `Prepared
 *     by`).
 *
 * The two-blank-line and end-of-page terminators are checked
 * separately by the main loop (they're structural, not regex-shaped).
 */
const SECTION_END_REGEX = new RegExp(
  [
    // Numbered with PERIOD only: "1.", "1.1", "10.2.3". The
    // `1) ...` form is intentionally excluded because it overlaps
    // the bullet-list shape (`1) item`) — list-prefix wins, the
    // candidate guards drop the line as list shape, and the section
    // continues. Real council document section headers use the
    // period form (verified against B1's `1.`-`7.` numbered structure).
    "^\\s*\\d+(?:\\.\\d+)*\\.\\s+\\S",
    // Roman with PERIOD only — same disambiguation rationale.
    "^\\s*(?:[IVXLCM]+|[ivxlcm]+)\\.\\s+\\S",
    // ALL-CAPS heading (≥5 chars, most chars uppercase)
    "^\\s*[A-Z][A-Z\\s]{4,}\\s*$",
    // Canonical post-section header keywords
    "^\\s*(?:Recommendations?|Conclusion|Signed|Date|Prepared\\s+by|Approved\\s+by|Distribution)\\s*[:\\-]?\\s*$",
  ].join("|"),
);

function isSectionEnd(line: string): boolean {
  return SECTION_END_REGEX.test(line);
}

// ---------------------------------------------------------------------------
// FP-guards on candidate sentences (Phase 1 §4)
// ---------------------------------------------------------------------------

const MIN_CANDIDATE_LENGTH = 20;
const MAX_CANDIDATE_LENGTH = 400;

/** Lines starting with a list-item / bullet glyph or pipe-cell. */
const LIST_OR_CELL_PREFIX = /^\s*(?:[•·●◦▪▫.\-–—*]|\d+\)|\|)/;

/**
 * Attribution-only sentences — short prose openers that report a
 * fact without expressing opinion. The prompt heuristic at line 249
 * of ai-detect.ts excludes the same shape; mirroring it deterministically.
 */
const ATTRIBUTION_PREFIX =
  /^\s*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+(?:was|were|attended|interviewed|provided|reviewed|stated|said|noted|confirmed|received|signed)\s/;

/** Date-only or reference-only lines. */
const DATE_OR_REF_LINE =
  /^\s*(?:\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|RC-[\w-]+|HR-[\w-]+|ADC-\d+)\b\s*$/;

/**
 * Metadata-label-line shape: a sequence of capitalised words followed
 * by a colon (and a value). Examples: `Investigator: Sarah Mitchell`,
 * `Classification: confidential`, `Reference: HR-INV-2026-018`. These
 * are form-style metadata, not opinion-prose, and would otherwise
 * sneak past the attribution / date / list guards.
 *
 * Why not just match `^[A-Z][a-z]+:`? Because some legitimate sentences
 * begin with a single capitalised word followed by a comma or period
 * but no colon (e.g. "Frankly, the proposed bylaw is unenforceable").
 * Anchoring on the colon is the disambiguator.
 *
 * The pattern allows multiple capital-cased words before the colon
 * to catch "Prepared by:", "Approved by:", etc. Single-capital words
 * with no following capital word are still caught (e.g. "Date:").
 */
const METADATA_LABEL_LINE = /^\s*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s*:\s/;

/**
 * Decide whether a single line inside a section's body should be
 * emitted as a free-frank candidate. Conservative: rejects bullets,
 * attribution stubs, dates, metadata labels, and very short or empty
 * lines. Returns true for prose-shaped opinion sentences AND for the
 * section's own candour-justification framing paragraph (Eugene's
 * clarification 2 — explicitly a positive case).
 */
function passesCandidateGuards(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < MIN_CANDIDATE_LENGTH) return false;
  if (trimmed.length > MAX_CANDIDATE_LENGTH) return false;
  if (LIST_OR_CELL_PREFIX.test(trimmed)) return false;
  if (ATTRIBUTION_PREFIX.test(trimmed)) return false;
  if (DATE_OR_REF_LINE.test(trimmed)) return false;
  if (METADATA_LABEL_LINE.test(trimmed)) return false;
  return true;
}

/**
 * Find the first marker entry that matches the line. Strong markers
 * (parentheticals) match anywhere in the line; weak markers (freeform
 * phrases) additionally require the line to look like a header so a
 * body sentence containing "candid view" doesn't open a sub-section.
 */
function lineMarkerMatch(line: string): MarkerEntry | undefined {
  for (const m of MARKER_DICTIONARY) {
    if (!m.regex.test(line)) continue;
    if (m.strong) return m;
    if (looksLikeHeader(line)) return m;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Scan extracted pages for section-marker headers and emit one
 * detection per prose-shaped sentence inside each section's body.
 *
 * Algorithm:
 *   1. For each page, split text into lines.
 *   2. Scan lines for a section-header marker. When found:
 *      a. Accumulate lines from the next line onward as candidate
 *         body until a section-end terminator OR two consecutive
 *         blank lines OR end-of-page is hit.
 *      b. Apply FP-guards to each candidate line; survivors are the
 *         body candidate set.
 *      c. If the surviving set has ≥2 candidates (the "real-section"
 *         minimum from §4), emit one match per surviving line. If
 *         only 0-1 candidates survive, the marker was likely a
 *         metadata field rather than a section header (e.g. B1's
 *         classification line "legal privilege, s7(2)(f) free and
 *         frank") and the whole region is dropped.
 *   3. Continue scanning past the section-end terminator on the same
 *      page (a doc can have multiple free-frank sections).
 *
 * @param pages - Pages produced by the text extraction step.
 * @param enabledTypes - Optional set of enabled detection type keys.
 *   When supplied AND `free-frank` is not in the set, the detector
 *   returns empty. Mirrors `detectLabelAdjacent`'s gating semantics.
 * @returns Array of section-marker matches across all pages.
 */
export function detectSectionMarkers(
  pages: ExtractedPage[],
  enabledTypes?: Set<string>,
): SectionMarkerMatch[] {
  if (enabledTypes && !enabledTypes.has("free-frank")) {
    return [];
  }

  const matches: SectionMarkerMatch[] = [];

  for (const page of pages) {
    if (!page.text) continue;

    const lines = page.text.split(/\r?\n/);

    // Track whether we are currently inside a section's body.
    // `markerLabel` records which pattern opened the section so the
    // emitted match's audit trail can identify the trigger.
    let inSection = false;
    let markerLabel = "";
    let bodyCandidates: Array<{
      line: string;
      offset: number;
    }> = [];
    let blankRun = 0;

    // Helper: flush the current section's accumulated candidates as
    // matches if the candidate count meets the ≥2 threshold. Resets
    // section state after flushing.
    const flushSection = () => {
      if (inSection && bodyCandidates.length >= 2) {
        for (const c of bodyCandidates) {
          matches.push({
            type: "free-frank",
            text: c.line.trim(),
            confidence: 75,
            page: page.pageNumber,
            suggestedGround: "s7_2fi",
            appliedGround: "s7_2fi",
            reasoning:
              "Sentence inside a section labelled candid / free-and-frank — section-marker deterministic pass.",
            markerMatched: markerLabel,
            offset: c.offset,
          });
        }
      }
      inSection = false;
      markerLabel = "";
      bodyCandidates = [];
      blankRun = 0;
    };

    // Track the running character offset as we walk lines so each
    // emitted match has a usable `offset` for downstream debugging.
    let runningOffset = 0;

    for (const line of lines) {
      const lineLength = line.length;
      // The +1 accounts for the consumed `\n` separator. The final
      // line in the array doesn't have a trailing newline in the
      // source text, but adding 1 for it never overshoots the
      // text.length used by callers — they only consume the offset
      // to identify the match position.
      const nextLineOffset = runningOffset + lineLength + 1;

      const trimmed = line.trim();

      // 1. Marker check FIRST: any line matching a section-marker
      //    pattern flushes the current section (if any) and opens a
      //    new one, regardless of inSection state. This handles
      //    back-to-back sections and sidesteps the marker-echo edge
      //    case — a body line that matches a marker becomes its own
      //    new (probably small) section, which then either grows ≥2
      //    candidates OR fails the minimum and drops silently.
      const markerMatch = lineMarkerMatch(line);
      if (markerMatch) {
        flushSection();
        inSection = true;
        markerLabel = markerMatch.label;
        bodyCandidates = [];
        blankRun = 0;
        runningOffset = nextLineOffset;
        continue;
      }

      // 2. If we're inside a section, look for section-end terminators
      //    or accumulate body candidates.
      if (inSection) {
        if (trimmed.length === 0) {
          blankRun += 1;
          if (blankRun >= 2) {
            flushSection();
          }
          runningOffset = nextLineOffset;
          continue;
        }

        if (isSectionEnd(line)) {
          flushSection();
          runningOffset = nextLineOffset;
          continue;
        }

        blankRun = 0;
        if (passesCandidateGuards(line)) {
          bodyCandidates.push({ line, offset: runningOffset });
        }
      }

      runningOffset = nextLineOffset;
    }

    // End-of-page terminator — flush whatever we have. A section
    // genuinely spanning pages would lose its tail here; the §3
    // design call accepts that loss as the conservative trade-off.
    flushSection();
  }

  return matches;
}
