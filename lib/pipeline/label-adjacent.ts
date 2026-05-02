/**
 * Label-adjacent detection (Phase 5 of the April 2026 detection-coverage
 * plan).
 *
 * Deterministic regex pass that catches labelled-value patterns the
 * AI classifies inconsistently — e.g. "Date of birth: 14 June 1983",
 * "Employee number | ADC-2284", "Address: 8b Marlin Grove, Awatere 4318".
 * Runs alongside `detectPatterns` (both are deterministic regex passes)
 * and feeds into the existing merge + bbox + dedup flow.
 *
 * Scope. Phase 5 targets the personal and commercial pathways via
 * more-reliable catching of labelled table rows. Orthogonal to the
 * governance pathway by design — governance misses live in free-frank /
 * legal-privilege sentence territory, not in labelled-field territory.
 *
 * Non-goals. This pass does NOT try to understand free-prose entity
 * references — those remain the AI's job. The value capture stops at
 * cell / line boundaries, so a sentence like "We should address this
 * issue immediately" does not get flagged by the address entry.
 */

import type { ExtractedPage } from "./extract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabelAdjacentMatch {
  type: string;
  text: string;
  confidence: number;
  page: number;
  reasoning: string;
  /** Which label definition produced this match, for audit trail. */
  labelMatched: string;
  /** Character offset of the VALUE (not the label) in the page text. */
  offset: number;
}

// ---------------------------------------------------------------------------
// Label dictionary
// ---------------------------------------------------------------------------

/**
 * Each entry maps a list of case-insensitive label variants to a
 * detection type + LGOIMA ground. Variants share the same type because
 * the label identifies what the value IS (e.g. any of "date of birth" /
 * "dob" / "d.o.b." flag the subsequent value as a personal-name DOB).
 *
 * Entries that need extra context (GP-name requires a colon/comma or
 * capitalised proper-noun neighbour) declare `extraGuard` — see the
 * `applyExtraGuard` implementation below.
 */
interface LabelEntry {
  /** All label variants that activate this entry. Case-insensitive. */
  labels: string[];
  type: string;
  reasoning: string;
  /**
   * Optional per-entry tightening guard. Returns true if the match
   * should be kept. Runs AFTER the generic FP guards.
   */
  extraGuard?: (pageText: string, labelEnd: number, value: string) => boolean;
}

const LABEL_DICTIONARY: LabelEntry[] = [
  // --- Personal identifiers -------------------------------------------------
  {
    labels: ["date of birth", "dob", "d.o.b.", "d.o.b", "born"],
    type: "personal-name",
    reasoning: "Labelled date of birth — personal identifier.",
  },
  {
    labels: ["address", "home address", "residential address", "postal address"],
    type: "address",
    reasoning: "Labelled personal address.",
  },
  {
    labels: ["phone", "mobile", "telephone", "tel", "contact number"],
    type: "phone",
    reasoning: "Labelled personal phone number.",
  },
  {
    labels: ["email", "email address", "e-mail"],
    type: "email-addr",
    reasoning: "Labelled personal email address.",
  },
  {
    labels: ["ird", "ird number", "tax number"],
    type: "ird",
    reasoning: "Labelled IRD / tax identifier.",
  },
  {
    labels: ["nhi", "nhi number", "health number"],
    type: "nhi",
    reasoning: "Labelled NHI (National Health Index) number.",
  },
  {
    labels: ["passport", "passport number", "passport no", "nz passport"],
    type: "nz-passport",
    reasoning: "Labelled passport number.",
  },
  {
    labels: [
      "driver licence",
      "driver's licence",
      "drivers licence",
      "driver license",
      "driver's license",
      "nz driver licence",
      "nz driver's licence",
      "nz drivers licence",
      "licence number",
      "dl number",
    ],
    type: "nz-driver-licence",
    reasoning: "Labelled driver licence number.",
  },
  {
    labels: ["bank account", "account number", "bank details"],
    type: "bank-account",
    reasoning: "Labelled bank account number.",
  },
  {
    labels: [
      "vehicle registration",
      "registration",
      "reg number",
      "plate",
      "number plate",
    ],
    type: "vehicle-reg",
    reasoning: "Labelled vehicle registration.",
  },

  // --- Confidential identifiers (no dedicated type) ------------------------
  {
    labels: [
      "employee number",
      "employee id",
      "staff id",
      "staff number",
      "personnel number",
      "badge number",
    ],
    type: "confidential",
    reasoning: "Labelled employee identifier — re-identifies an individual.",
  },
  {
    labels: ["salary", "salary band", "salary range", "remuneration", "pay band"],
    type: "confidential",
    reasoning: "Labelled salary / remuneration — privacy-sensitive compensation.",
  },

  // --- Contextual / high-FP-risk entries -----------------------------------
  // GP / practitioner name. Only fires when the captured value looks like
  // a proper-noun name (first token capitalised; at least one letter).
  // Guards against "GP-12 grid reference" false positives by requiring a
  // colon / comma / pipe separator AND a capitalised first value token.
  {
    labels: ["gp", "general practitioner"],
    type: "personal-name",
    reasoning:
      "Labelled GP / general practitioner — third-party professional name.",
    extraGuard: (_pageText, _labelEnd, value) => {
      // Require the value to START with a capitalised alphabetic token
      // (optionally preceded by "Dr"/"Dr."). Reject numeric / grid-ref
      // style values like "GP-12".
      const trimmed = value.trim();
      // Must begin with uppercase letter (A-Z or NZ macron set).
      // Reject bare digits or all-caps IDs.
      if (!/^[A-Z][a-zA-ZāēīōūĀĒĪŌŪ]/.test(trimmed)) return false;
      // Reject values shorter than 3 chars — "Dr" alone is not enough.
      if (trimmed.length < 3) return false;
      return true;
    },
  },
  // ICD-10 diagnostic code prefix heuristic. A label like "ICD-10" /
  // "ICD 10" / "ICD-10-AM" followed by an F/G/Z/etc. code is a
  // confidential diagnostic identifier.
  {
    labels: ["icd-10", "icd 10", "icd-10-am", "icd 10 am", "diagnosis code"],
    type: "confidential",
    reasoning: "Labelled diagnostic code — individual medical identifier.",
    extraGuard: (_pageText, _labelEnd, value) => {
      // Must start with a letter+digits pattern like F43.23 / G31.9 /
      // Z09 — a realistic ICD-10 code shape. Reject free prose.
      return /^[A-Z]\d{1,2}(?:\.\d{1,3})?\b/.test(value.trim());
    },
  },
];

// ---------------------------------------------------------------------------
// Regex construction
// ---------------------------------------------------------------------------

/** Escape a raw string for safe inclusion in a regex pattern. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a regex fragment for a single label variant. Internal
 * whitespace collapses to `\s+` (so "date of birth" matches "date  of
 * birth"); non-whitespace characters (including dots in "d.o.b.") are
 * escaped literally.
 */
function buildLabelFragment(label: string): string {
  return label
    .split(/\s+/)
    .map(escapeRegex)
    .join("\\s+");
}

/**
 * Build the full compiled regex for a dictionary entry. The structure:
 *
 *   START_ANCHOR  LABEL  OPT_WHITESPACE  SEPARATOR  OPT_WHITESPACE  VALUE
 *
 * where:
 *   - START_ANCHOR matches start-of-string, start-of-line, or a cell
 *     boundary (`|`). This enforces the "label must be at start of line
 *     or cell" FP guard — prevents 'address' in the middle of prose
 *     from firing.
 *   - LABEL is the alternation of all variants, case-insensitive, word-
 *     boundary anchored.
 *   - SEPARATOR is one of `:`, `|`, `-`, `–` (en-dash), `—` (em-dash),
 *     tab, or a lone newline.
 *   - VALUE captures up to 80 non-cell-boundary characters.
 */
function compileEntryRegex(entry: LabelEntry): RegExp {
  const labels = entry.labels.map(buildLabelFragment).join("|");
  // START_ANCHOR: start of string, a newline, or a pipe (table cell
  // boundary). Leading whitespace after the anchor is tolerated.
  const startAnchor = "(?:^|[\\n|])\\s*";
  // LABEL group. Trailing negative lookahead (not `\b`) so labels that
  // end in a non-word character — e.g. "d.o.b." — still terminate
  // cleanly. `\b` requires a word-to-non-word transition, which fails
  // when the label's last char is already non-word. `(?!\w)` simply
  // says "the next character must not be a word character", which
  // covers both "address" → colon and "d.o.b." → space.
  const labelGroup = `(?:${labels})(?!\\w)`;
  // SEPARATOR: at least one of the listed chars, tolerating surrounding
  // whitespace. Using a character class so any single separator counts.
  // Newline is included because Azure DI extraction frequently renders
  // tabular "Label / Value" pairs on consecutive lines with no colon
  // or pipe between them — B1's header table is the canonical example.
  // Space alone is NOT sufficient (would match prose like "Phone 027
  // 412 6789 is our main line" where no labelling is intended); the
  // separator must include at least one colon, pipe, dash, tab, or
  // newline.
  const separator = "\\s*[:|\\-\\u2013\\u2014\\t\\n]+\\s*";
  // VALUE: up to 80 non-cell-boundary chars. Bounded length keeps
  // captures under the downstream TEXT_SEARCH_MAX_LENGTH guard in
  // redact-pdf.ts.
  const value = "([^\\n|\\r]{1,80})";
  return new RegExp(`${startAnchor}(${labelGroup})${separator}${value}`, "gi");
}

// ---------------------------------------------------------------------------
// False-positive guards
// ---------------------------------------------------------------------------

/**
 * Whole-word prose markers whose appearance in the first ~10 characters
 * of a captured value strongly suggests prose continuation rather than
 * a labelled field. Case-insensitive whole-word match.
 */
const PROSE_LEADING_MARKERS = new Set(["the", "a", "an", "is", "was", "that", "this"]);

function looksLikeProseStart(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  // Take first word.
  const firstWord = trimmed.split(/[\s,.]+/)[0];
  if (!firstWord) return false;
  return PROSE_LEADING_MARKERS.has(firstWord);
}

/**
 * All label variants across the dictionary, lowercased, normalised to
 * single-space word joins. Used to detect the "back-to-back labels
 * with no intervening value" pattern — when a form has a label row
 * immediately followed by another label row, the newline separator
 * would otherwise make the second label appear to be the first label's
 * value. This guard rejects such matches.
 */
const ALL_LABELS_LOWER: ReadonlySet<string> = new Set(
  LABEL_DICTIONARY.flatMap((e) =>
    e.labels.map((l) => l.toLowerCase().trim().replace(/\s+/g, " ")),
  ),
);

function looksLikeAnotherLabel(value: string): boolean {
  const normalised = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalised.length === 0) return false;
  // Direct-label check — the whole value IS a label variant.
  if (ALL_LABELS_LOWER.has(normalised)) return true;
  // Prefix check — value starts with a label variant followed by word
  // boundary. Catches "Employee number ADC-2284" if the separator
  // regex somehow grabbed a whole label-plus-value chunk as the value.
  for (const label of ALL_LABELS_LOWER) {
    if (
      normalised.startsWith(label) &&
      (normalised.length === label.length ||
        /\s/.test(normalised[label.length] ?? ""))
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Scan extracted pages for labelled-value patterns and emit one
 * detection per match.
 *
 * @param pages - Pages produced by the text extraction step.
 * @param enabledTypes - Optional set of enabled detection type keys.
 *   `nhi` is always included (matching the patterns.ts convention that
 *   treats NHI as a safety default). Entries whose target type is not
 *   in `enabledTypes` are skipped.
 * @returns Array of label-adjacent matches across all pages.
 */
export function detectLabelAdjacent(
  pages: ExtractedPage[],
  enabledTypes?: Set<string>,
): LabelAdjacentMatch[] {
  // Filter by enabled types if a set was supplied.
  //  - `nhi` is always included (matches the patterns.ts convention
  //    that treats NHI as a safety default irrespective of toggle state).
  //  - `confidential` is always included because the toggle system has
  //    no "Confidential" toggle — it is a catch-all type that `ai-detect.ts`
  //    also always allows (`buildSystemPrompt`'s type filter treats it
  //    the same way). Without this, the "Employee number"/"Salary band"/
  //    "ICD-10" label entries — all of which target `confidential` —
  //    would silently never fire in production.
  const activeEntries = enabledTypes
    ? LABEL_DICTIONARY.filter(
        (e) =>
          e.type === "nhi" ||
          e.type === "confidential" ||
          enabledTypes.has(e.type),
      )
    : LABEL_DICTIONARY;

  // Compile regex once per entry (shared across pages).
  const compiled = activeEntries.map((entry) => ({
    entry,
    regex: compileEntryRegex(entry),
  }));

  const matches: LabelAdjacentMatch[] = [];

  for (const page of pages) {
    if (!page.text) continue;

    // Track occupied value ranges on this page so multiple dictionary
    // entries cannot claim overlapping spans (first match wins).
    const occupied: Array<{ start: number; end: number }> = [];

    for (const { entry, regex } of compiled) {
      // Fresh per-scan iteration; /g state is per-regex so we reset by
      // slicing matchAll into an array.
      for (const m of page.text.matchAll(regex)) {
        if (m.index === undefined) continue;

        // Group 1 is the LABEL; group 2 is the VALUE.
        const fullMatch = m[0];
        const labelText = m[1];
        const rawValue = m[2];

        if (!labelText || rawValue === undefined) continue;

        const valueTrimmed = rawValue.trim();

        // FP guard: empty or near-empty.
        if (valueTrimmed.length < 2) continue;

        // FP guard: value starts with a prose marker.
        if (looksLikeProseStart(valueTrimmed)) continue;

        // FP guard: value is itself a dictionary label. Catches the
        // "stacked labels with missing value" edge case: if a form has
        // two consecutive label rows with no value between them, the
        // newline separator would otherwise flag the second label as
        // the first label's value.
        if (looksLikeAnotherLabel(valueTrimmed)) continue;

        // FP guard: overlap with a previously-claimed value range.
        // Compute the value's offset within the page text. The start
        // anchor + leading whitespace can push m.index before the
        // label, so we locate the value by slicing from the END of the
        // full match back by the raw-value length.
        const fullMatchEnd = m.index + fullMatch.length;
        const valueStart = fullMatchEnd - rawValue.length;
        const valueEnd = fullMatchEnd;
        const overlap = occupied.some(
          (r) => valueStart < r.end && valueEnd > r.start,
        );
        if (overlap) continue;

        // Per-entry extra guard (applied last — lets the dictionary
        // tighten specific high-FP-risk entries without complicating
        // the generic path).
        if (entry.extraGuard) {
          const labelEnd = valueStart;
          if (!entry.extraGuard(page.text, labelEnd, rawValue)) continue;
        }

        occupied.push({ start: valueStart, end: valueEnd });
        matches.push({
          type: entry.type,
          text: valueTrimmed,
          confidence: 95,
          page: page.pageNumber,
          reasoning: entry.reasoning,
          labelMatched: labelText.trim(),
          offset: valueStart,
        });
      }
    }
  }

  return matches;
}
