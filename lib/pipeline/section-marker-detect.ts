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
 * Header-shape heuristic for weak markers and sub-section terminators.
 * A line passes the check when ALL of the following hold:
 *   - non-empty after trim,
 *   - ≤ HEADER_SHAPE_MAX_LENGTH characters (most council headers are
 *     well under 50 chars; cap at 80 to leave room for ground-citation
 *     suffixes like " - s7(2)(g)"),
 *   - no terminal period / exclamation / question mark (sentence-shape
 *     indicator),
 *   - ≤ HEADER_SHAPE_MAX_WORDS words. Wrapped first lines of long
 *     prose sentences often pass the length check ("Officer's candid
 *     opinion is that the proposed bylaw is structurally" — 70 chars,
 *     no terminal period, but 10 words — clearly mid-sentence). The
 *     word-count check disambiguates header-shape from prose-wrap.
 */
const HEADER_SHAPE_MAX_LENGTH = 80;
const HEADER_SHAPE_MAX_WORDS = 8;

function looksLikeHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > HEADER_SHAPE_MAX_LENGTH) return false;
  if (/[.?!]$/.test(trimmed)) return false;
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > HEADER_SHAPE_MAX_WORDS) return false;
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

/**
 * Sub-section terminators (Fix 1, post-bench-regression diagnosis).
 *
 * A "(free and frank)" section's body often contains nested sub-sections
 * that cite a DIFFERENT LGOIMA ground in their header — typical council
 * memo structure puts a candid policy advice paragraph above sub-
 * sections labelled "Privileged legal advice — s7(2)(g)" or
 * "Confidential account — s7(2)(c)(i)". Without this terminator,
 * every body sentence inside the sub-sections gets typed as free-frank
 * even though the bench ground truth (and the document's own header)
 * marks them as legal-privilege / confidential / harassment-risk.
 *
 * The two regexes below capture the two shapes these sub-section
 * headers take in surveyed council documents:
 *   - explicit ground citation (`s7(2)(g)`, `s6(c)`, etc.)
 *   - keyword header ("Privileged legal advice", "In confidence", etc.)
 *
 * Both must additionally pass `looksLikeHeader` — a mid-prose
 * mention of `(s7(2)(g))` inside an opinion sentence does NOT
 * terminate the section. This mirrors the strong-vs-weak-marker
 * design from the opening-side patterns above.
 *
 * Bare `s7(2)(f)` (no inner letter) and `s7(2)(f)(i)` are deliberately
 * excluded — they are the section's OWN ground. B1's self-justification
 * paragraph contains "(s7(2)(f))" in a body line; that line must NOT
 * terminate the section. `s7(2)(f)(ii)` IS included — that's harassment-
 * risk, a different ground.
 */
const NON_FREE_FRANK_GROUND_REGEX =
  /\bs\s*6\s*\(\s*[a-d]\s*\)|\bs\s*7\s*\(\s*2\s*\)\s*\(\s*(?:[abcdeghij]|ba)\s*\)|\bs\s*7\s*\(\s*2\s*\)\s*\(\s*f\s*\)\s*\(\s*ii\s*\)/i;

const NON_FREE_FRANK_KEYWORD_REGEX =
  /\b(?:Privileged\s+legal\s+advice|Privileged\s+advice|Confidential\s+account|Commercial[\s-]+in[\s-]+confidence|In\s+confidence|Solicitor[\s-]?client(?:\s+privilege)?|Legal\s+privilege)\b/i;

function isSectionEnd(line: string): boolean {
  if (SECTION_END_REGEX.test(line)) return true;
  // Sub-section transitions count only when the line ALSO looks like
  // a header — avoids mid-prose mentions of other grounds opening
  // a section-end transition.
  if (looksLikeHeader(line)) {
    if (NON_FREE_FRANK_GROUND_REGEX.test(line)) return true;
    if (NON_FREE_FRANK_KEYWORD_REGEX.test(line)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// FP-guards (Phase 1 §4 + Fix 2 sentence-vs-line split)
// ---------------------------------------------------------------------------
//
// Two guard layers (Fix 2 split, post-bench-regression):
//   - LINE guards: applied as each line is appended to the body
//     buffer. Reject bullets / attribution-stubs / date-only / metadata-
//     labels / very-short lines. Lines that fail are dropped (and
//     act as a continuation break — flush the buffer).
//   - SENTENCE guards: applied after the buffer is split into
//     sentences. Length floor (20) and ceiling (800) gate the final
//     emission. Multi-line wraps are tolerated — a single sentence
//     spanning 3 visual lines might be 250 chars when joined, well
//     under the ceiling.

const MIN_LINE_LENGTH = 5;
const MIN_SENTENCE_LENGTH = 20;
const MAX_SENTENCE_LENGTH = 800;

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
 * are form-style metadata, not opinion-prose.
 */
const METADATA_LABEL_LINE = /^\s*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s*:\s/;

/**
 * LINE-level guard: applied as each candidate body line is appended
 * to the sentence-accumulation buffer. A line that fails this guard
 * is dropped AND acts as a paragraph break (the buffer is flushed
 * before the line is skipped). Length floor here is small (5 chars)
 * — the tighter sentence-level floor at MIN_SENTENCE_LENGTH gates
 * the final emission after sentence splitting.
 */
function passesLineGuards(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < MIN_LINE_LENGTH) return false;
  if (LIST_OR_CELL_PREFIX.test(trimmed)) return false;
  if (ATTRIBUTION_PREFIX.test(trimmed)) return false;
  if (DATE_OR_REF_LINE.test(trimmed)) return false;
  if (METADATA_LABEL_LINE.test(trimmed)) return false;
  return true;
}

/**
 * Split an accumulated body buffer into logical sentences (Fix 2).
 *
 * Two sentence-boundary patterns:
 *   1. `(?<=[.!?])\s+(?=[A-Z])` — period / exclamation / question
 *      followed by whitespace then a capital-letter sentence start.
 *   2. `(?<=\):)\s+(?=[A-Z])` — close-paren-colon followed by
 *      whitespace then capital. Handles "...released (s7(2)(f)): In
 *      my assessment..." where the colon closes a citation-tagged
 *      setup clause and the next capital starts the actual sentence.
 *
 * Sentence-shape guards (length floor 20 / ceiling 800) drop very
 * short fragments (e.g. trailing "Conclusion." that survived an
 * imperfect terminator) and runaway captures.
 */
function splitIntoSentences(buffer: string): string[] {
  const text = buffer.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z])|(?<=\):)\s+(?=[A-Z])/);
  const out: string[] = [];
  for (const s of raw) {
    const trimmed = s.trim();
    if (trimmed.length < MIN_SENTENCE_LENGTH) continue;
    if (trimmed.length > MAX_SENTENCE_LENGTH) continue;
    out.push(trimmed);
  }
  return out;
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
    // emitted match's audit trail can identify the trigger. Body
    // content accumulates in `buffer` (Fix 2 sentence-level emission)
    // — the buffer is flushed via `flushBuffer` whenever the section
    // closes, a paragraph break is detected, or a non-prose line
    // interrupts the prose flow.
    let inSection = false;
    let markerLabel = "";
    let buffer = "";
    let bufferStartOffset = 0;
    let bodyCandidates: Array<{ text: string; offset: number }> = [];
    let blankRun = 0;

    /**
     * Split the accumulated buffer into sentences and append survivors
     * to bodyCandidates. Resets the buffer.
     */
    const flushBuffer = () => {
      if (!buffer.trim()) {
        buffer = "";
        return;
      }
      const sentences = splitIntoSentences(buffer);
      for (const s of sentences) {
        bodyCandidates.push({ text: s, offset: bufferStartOffset });
      }
      buffer = "";
    };

    /**
     * Flush the buffer first, then emit matches if the candidate count
     * meets the ≥2 threshold. Resets section state.
     */
    const flushSection = () => {
      flushBuffer();
      if (inSection && bodyCandidates.length >= 2) {
        for (const c of bodyCandidates) {
          matches.push({
            type: "free-frank",
            text: c.text,
            confidence: 75,
            page: page.pageNumber,
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
        buffer = "";
        blankRun = 0;
        runningOffset = nextLineOffset;
        continue;
      }

      // 2. If we're inside a section, look for section-end terminators
      //    or accumulate body candidates.
      if (inSection) {
        if (trimmed.length === 0) {
          blankRun += 1;
          // Blank line is a paragraph break: flush the buffer so any
          // accumulated sentences become candidates, but stay in the
          // section. Two consecutive blanks terminate the section.
          flushBuffer();
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
        if (!passesLineGuards(line)) {
          // Line failed shape guards (bullet, attribution, etc.).
          // Flush buffer (the prose flow is interrupted) and skip
          // the line itself.
          flushBuffer();
          runningOffset = nextLineOffset;
          continue;
        }

        // Append the prose-shaped line to the sentence-accumulation
        // buffer. Whitespace between lines becomes a single space at
        // splitIntoSentences time.
        if (buffer === "") {
          bufferStartOffset = runningOffset;
        }
        buffer += (buffer ? " " : "") + trimmed;
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
