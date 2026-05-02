/**
 * Section-marker detection unit tests (April 2026 free-frank
 * backstop). Mirrors the test shape of `label-adjacent.test.ts` —
 * pure function over `ExtractedPage[]`, no mocks needed.
 *
 * Coverage map vs Phase 1 design:
 *   §2 — each header pattern fires on a positive example.
 *   §3 — section-end heuristic terminates on numbered next section,
 *        ALL-CAPS heading, canonical post-section keywords, two
 *        consecutive blank lines, and end-of-page.
 *   §4 — FP-guards reject bullet lists, attribution stubs, dates,
 *        marker echoes, and lines outside the length floor / ceiling;
 *        the "real-section" minimum (≥2 candidate sentences) drops
 *        metadata-style header echoes.
 *
 * Eugene's clarification 2 (positive test for the section-self-
 * justification framing paragraph from B1) is the
 * `b1-style-self-justification` test below.
 */
import { describe, it, expect } from "vitest";
import { detectSectionMarkers } from "../section-marker-detect";
import type { ExtractedPage } from "../extract";

function page(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text };
}

// ---------------------------------------------------------------------------
// §2 — header pattern coverage
// ---------------------------------------------------------------------------

describe("detectSectionMarkers — header patterns (Phase 1 §2)", () => {
  it("fires on `(free and frank)` parenthetical", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "6. Candid commentary (free and frank)",
          "In my assessment Mr Kellogg's conduct crosses the line of what is acceptable.",
          "Both parties have credibility issues and this is relevant context for any remedy.",
          "7. Recommendations",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.every((m) => m.markerMatched === "(free and frank)")).toBe(true);
  });

  it("fires on bare `free and frank` inline", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Findings — free and frank assessment",
          "The investigator's view is that this matter is mixed and complex.",
          "My honest read is that a written warning is the proportionate outcome.",
          "8. Recommendations",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    // The parenthetical regex doesn't match here — it's "free and frank"
    // without the parens — so the markerMatched is the bare-inline label.
    expect(result.every((m) => m.markerMatched === "free and frank")).toBe(true);
  });

  it("fires on `candid commentary`", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Section 7. Candid investigator commentary",
          "The investigator considers that Council's response was reasonable.",
          "There is, however, a residual risk that further complaints emerge.",
          "8. Recommendations",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.every((m) => m.markerMatched === "candid commentary")).toBe(true);
  });

  it("fires on `(candid)` short-form", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer view (candid)",
          "In my professional judgement the proposed bylaw is unenforceable.",
          "Council should consider abandoning it before the next committee meeting.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.every((m) => m.markerMatched === "(candid)")).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Fix 1 — sub-section header terminators (post-bench-regression).
  // ---------------------------------------------------------------------

  it("Fix 1 — terminates on `Privileged legal advice - s7(2)(g)` sub-section header", () => {
    // A's regression scenario: an outer (free and frank) section
    // containing nested sub-sections labelled with non-free-frank
    // ground citations. Pre-fix every body sentence in the
    // sub-section was typed `free-frank`; post-fix the sub-section
    // header terminates the section before any of its body lines
    // become candidates.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Candid policy advice (free and frank)",
          "Officers' candid view is that the current bylaw is unenforceable.",
          "Recommend the committee be briefed on the enforcement reality.",
          "Privileged legal advice - s7(2)(g)",
          "We have obtained privileged legal opinion from external counsel.",
          "Counsel's settlement range is $25,000 to $55,000 inclusive of legal costs.",
          "8. Recommendations",
        ].join("\n"),
      ),
    ]);
    // Only the two pre-sub-section lines fire as free-frank.
    // The legal-privilege body lines must NOT be flagged.
    expect(result.length).toBe(2);
    expect(result.every((m) => m.text.startsWith("Officers'") || m.text.startsWith("Recommend"))).toBe(true);
    expect(result.some((m) => m.text.includes("privileged legal opinion"))).toBe(false);
    expect(result.some((m) => m.text.includes("settlement range"))).toBe(false);
  });

  it("Fix 1 — terminates on `Confidential account - s7(2)(c)(i)` sub-section header", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Candid policy advice (free and frank)",
          "Officers' candid view is that this matter is genuinely contested.",
          "Recommend the committee be briefed on the policy options.",
          "Confidential account - s7(2)(c)(i)",
          "A former officer has provided a written account on condition of anonymity.",
          "The account describes systematic favouritism in enforcement decisions.",
          "8. Recommendations",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.some((m) => m.text.includes("written account"))).toBe(false);
    expect(result.some((m) => m.text.includes("favouritism"))).toBe(false);
  });

  it("Fix 1 — terminates on bare ground citation in a header position", () => {
    // Some templates use just the statutory ground as the sub-section
    // header. Should still terminate even without a keyword phrase.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "(free and frank)",
          "Officer's candid opinion is that the application should be declined.",
          "The cost-benefit balance does not favour escalation at this time.",
          "s7(2)(g)",
          "Counsel's view, expressed candidly, is that we should settle.",
          "Settlement range is $40,000 to $70,000 plus costs.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.some((m) => m.text.includes("Counsel's view"))).toBe(false);
    expect(result.some((m) => m.text.includes("Settlement range"))).toBe(false);
  });

  it("Fix 1 — does NOT terminate on s7(2)(f)(i) or bare s7(2)(f) (the section's own ground)", () => {
    // B1's self-justification line "...if it were released (s7(2)(f)):"
    // contains the section's own ground citation in the middle of a
    // body line. Pre-Fix-1 design (with pattern 5) wrongly treated
    // this as a sub-section header; current behaviour leaves it as
    // body content. The Fix 1 terminator regex deliberately excludes
    // s7(2)(f) and s7(2)(f)(i) for this reason.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "6. Candid commentary (free and frank)",
          "This section is provided for the Chief Executive only and is not part of the formal findings.",
          "It would materially chill future investigator candour if it were released (s7(2)(f)):",
          "In my assessment Mr Kellogg's conduct crosses the line of what is acceptable.",
          "Both parties have credibility issues.",
          "7. Recommendations",
        ].join("\n"),
      ),
    ]);
    // All four body lines stay inside the same section.
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(
      result.some((m) =>
        m.text.startsWith("This section is provided for the Chief Executive only"),
      ),
    ).toBe(true);
    expect(result.some((m) => m.text.includes("Mr Kellogg's conduct crosses the line"))).toBe(true);
  });

  it("Fix 1 — does NOT terminate on a mid-prose ground mention (only header-shape lines do)", () => {
    // A body line that mentions s7(2)(g) inline in a long sentence
    // ending with a period is prose, not a header. Section continues.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Candid commentary (free and frank)",
          "Officer's candid view is that the matter touches on s7(2)(g) territory but the analysis is not yet complete.",
          "Recommend further consultation before any decision is communicated externally.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // Both body lines stay as candidates — neither is header-shaped.
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some((m) => m.text.includes("touches on s7(2)(g) territory"))).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Fix 2 — logical-sentence emission (post-bench-regression).
  // ---------------------------------------------------------------------

  it("Fix 2 — multi-line wrap of one logical sentence emits ONE candidate", () => {
    // A single sentence wrapped across 3 visual lines (typical PDF
    // extraction shape) becomes ONE detector candidate, not three
    // line-fragment candidates. Downstream calculateBBoxAll +
    // process.ts per-bbox fan-out produces the per-visual-line
    // Detection rows for canvas rendering.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Officer's candid opinion is that the proposed bylaw is structurally",
          "unenforceable and that council should consider abandoning it before",
          "the next committee meeting which is scheduled for the following week.",
          "Recommend a workshop with elected members ahead of any public consultation.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // 2 candidates: the 3-line wrap (one logical sentence) + the
    // single-line "Recommend" sentence. Pre-Fix-2 this would have
    // emitted 4 line-fragment candidates.
    expect(result.length).toBe(2);
    // The wrapped sentence's text should be the joined whole sentence,
    // not a fragment.
    expect(
      result.some((m) =>
        m.text.startsWith("Officer's candid opinion is that") &&
        m.text.includes("scheduled for the following week"),
      ),
    ).toBe(true);
  });

  it("Fix 2 — multiple sentences on one visual line each emit their own candidate", () => {
    // The inverse pattern: one extracted line containing multiple
    // sentences (common in dense paragraph layouts). Each
    // sentence-terminator-then-capital splits into its own
    // candidate.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Officer's candid view is that this matter is contested. Both parties have credibility issues. Settlement would avoid significant costs.",
          "Recommend a facilitated conversation rather than dismissal.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // 4 candidates: 3 sentences from the dense line + the
    // single-line "Recommend" sentence.
    expect(result.length).toBe(4);
    expect(result.some((m) => m.text === "Officer's candid view is that this matter is contested.")).toBe(true);
    expect(result.some((m) => m.text === "Both parties have credibility issues.")).toBe(true);
    expect(result.some((m) => m.text.startsWith("Settlement would avoid"))).toBe(true);
  });

  it("Fix 2 — closing-paren-colon `(s7(2)(f)):` is a sentence boundary", () => {
    // Specific to B1's self-justification pattern. The buffer joining
    // "...if it were released (s7(2)(f)):" with "In my assessment..."
    // would otherwise produce one giant pseudo-sentence. The
    // (?<=\):)\s+(?=[A-Z]) split rule covers this.
    const result = detectSectionMarkers([
      page(
        3,
        [
          "Candid commentary (free and frank)",
          "It would materially chill future investigator candour if it were released (s7(2)(f)):",
          "In my assessment Mr Kellogg's conduct crosses the line of what is acceptable.",
          "Both parties have credibility issues.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // 3 candidates — the citation-tagged setup, the assessment, and
    // the credibility statement. Without the close-paren-colon split
    // the first two would merge into one long "released (s7(2)(f)): In
    // my assessment..." pseudo-sentence.
    expect(result.length).toBe(3);
    expect(result.some((m) => m.text.endsWith("(s7(2)(f)):"))).toBe(true);
    expect(result.some((m) => m.text.startsWith("In my assessment Mr Kellogg's conduct"))).toBe(true);
  });

  it("Fix 2 — bullet lines break the sentence-accumulation buffer", () => {
    // A bullet appearing between two prose lines should NOT cause
    // the two prose lines to merge into one buffered "sentence".
    // The bullet flushes the buffer.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Officer's candid opinion paragraph one is short.",
          "• A bullet point that should NOT merge the surrounding prose.",
          "Officer's candid opinion paragraph two is also short.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(
      result.every(
        (m) =>
          m.text === "Officer's candid opinion paragraph one is short." ||
          m.text === "Officer's candid opinion paragraph two is also short.",
      ),
    ).toBe(true);
  });

  it("Fix 2 — blank line inside a section flushes the buffer (paragraph break)", () => {
    // Two consecutive blanks terminate the section; a single blank
    // is just a paragraph break — flush buffer, keep section open.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Officer's candid opinion paragraph one is genuinely about a contested matter.",
          "",
          "Officer's candid opinion paragraph two is about a separate but related point.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // Single blank between paragraphs — both candidates land in the
    // same section.
    expect(result.length).toBe(2);
  });

  it("does NOT fire on parenthetical `(s7(2)(f))` mid-prose citations (Eugene clarification 2 fix)", () => {
    // The dropped statutory-ground pattern would have broken B1's
    // self-justification paragraph: the line "...if it were released
    // (s7(2)(f)):" contains the citation INSIDE parentheses, mid-
    // prose, and the original v1 pattern would have opened a new
    // section there. With pattern 5 removed, this line stays inside
    // the original (free and frank) section's body.
    const result = detectSectionMarkers([
      page(
        3,
        [
          "6. Candid investigator commentary (free and frank)",
          "This section is provided for the Chief Executive only and is not part of the formal findings. It would",
          "materially chill future investigator candour if it were released (s7(2)(f)):",
          "In my assessment Mr Kellogg's conduct crosses the line of what is acceptable.",
          "Both parties have credibility issues and this is relevant context.",
          "7. Recommendations",
        ].join("\n"),
      ),
    ]);
    // All four body lines (the two-line self-justification + the two
    // opinion sentences) survive as a single section's candidates.
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(
      result.some((m) =>
        m.text.startsWith(
          "This section is provided for the Chief Executive only",
        ),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §3 — section-end heuristic
// ---------------------------------------------------------------------------

describe("detectSectionMarkers — section-end heuristic (Phase 1 §3)", () => {
  it("terminates on a numbered next section", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "6. Candid commentary (free and frank)",
          "Investigator opinion paragraph one — the matter is genuinely contested.",
          "Investigator opinion paragraph two — settlement is the safer route.",
          "7. Recommendations",
          "Recommendation 1: issue final written warning.",
          "Recommendation 2: arrange leadership coaching.",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    // Recommendations rows must NOT bleed into the section-marker
    // detections (different section, terminator hit).
    expect(result.some((m) => m.text.startsWith("Recommendation"))).toBe(false);
  });

  it("terminates on an ALL-CAPS heading", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Free and frank section",
          "Officer's candid view is that we should not contest this further.",
          "Cost exposure is the dominant factor in the recommendation below.",
          "DISTRIBUTION",
          "CE only — this section is restricted.",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.some((m) => m.text.includes("CE only"))).toBe(false);
  });

  it("terminates on canonical post-section keywords (`Recommendations`, `Signed`, `Date`)", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Free and frank advice section",
          "Officer's candid assessment of the facts is that they are mixed.",
          "Recommend declining the application based on the precedent from RC-2025-0312.",
          "Signed",
          "Maia Rangi, Senior Officer",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.some((m) => m.text.includes("Maia Rangi"))).toBe(false);
  });

  it("terminates on two consecutive blank lines", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Sentence one inside the section about candid investigator opinion.",
          "Sentence two inside the section about a recommendation to settle.",
          "",
          "",
          "Some unrelated next paragraph of factual procedural content here.",
          "And one more line that should NOT be picked up by the detector.",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.some((m) => m.text.includes("unrelated"))).toBe(false);
  });

  it("terminates at end-of-page (does not bleed into next page)", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Sentence one is about the officer's candid assessment of policy fit.",
          "Sentence two is about the officer's recommended next steps for council.",
        ].join("\n"),
      ),
      page(
        2,
        [
          "This is page 2 unrelated content that should NOT be a section-marker match.",
          "Even though page 1's section was technically still open at the page boundary.",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    // Both matches are on page 1.
    expect(result.every((m) => m.page === 1)).toBe(true);
  });

  it("supports back-to-back sections on the same page", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Section A — candid commentary",
          "Officer's candid view on matter A is that it should be declined.",
          "Cost exposure on matter A is the dominant factor in this recommendation.",
          "Section B — candid review",
          "Officer's candid view on matter B is that approval is appropriate.",
          "Risk profile on matter B is well within the council's normal tolerance.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // Each section yields 2 matches → 4 total.
    expect(result.length).toBe(4);
    const matterA = result.filter((m) => m.text.includes("matter A"));
    const matterB = result.filter((m) => m.text.includes("matter B"));
    expect(matterA.length).toBe(2);
    expect(matterB.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §4 — FP-guards
// ---------------------------------------------------------------------------

describe("detectSectionMarkers — FP-guards (Phase 1 §4)", () => {
  it("drops bullet-list lines starting with •, ·, -, –, —, *, digit-paren, or pipe", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "• Bullet point one — should be dropped as list shape, not opinion prose.",
          "- Dash bullet two — also dropped because list-item lines are facts not opinions.",
          "1) Numbered bullet three — dropped because list shape excludes opinion candidates.",
          "| Pipe-cell content | Also a tabular row, not a sentence to flag |",
          "Officer's candid opinion paragraph one which IS a real sentence to flag.",
          "Officer's candid opinion paragraph two which IS also a real sentence.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // Only the two opinion paragraphs should fire.
    expect(result.length).toBe(2);
    expect(result.every((m) => m.text.startsWith("Officer's candid"))).toBe(true);
  });

  it("drops attribution-only sentences (`X was interviewed`, `X stated`)", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Sarah Mitchell was interviewed on 12 March 2026 about the incident.",
          "Mr Kellogg stated that he had not intended any harm by the remarks.",
          "Officer's candid opinion is that the explanation is not credible on the facts.",
          "Officer recommends a final written warning rather than dismissal at this stage.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // Two attribution lines dropped, two opinion lines kept.
    expect(result.length).toBe(2);
    expect(result.some((m) => m.text.includes("not credible"))).toBe(true);
    expect(result.some((m) => m.text.includes("final written warning"))).toBe(true);
    expect(result.some((m) => m.text.includes("was interviewed"))).toBe(false);
    expect(result.some((m) => m.text.includes("stated that"))).toBe(false);
  });

  it("drops date-only and reference-only lines", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "12 March 2026",
          "RC-2026-0419",
          "Officer's candid opinion is that the application should be approved subject to conditions.",
          "Cost exposure to council is well within the normal tolerance for this category.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.some((m) => m.text === "12 March 2026")).toBe(false);
    expect(result.some((m) => m.text === "RC-2026-0419")).toBe(false);
  });

  it("drops short lines below the 20-char floor", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Yes.",
          "Maybe not.",
          "Officer's candid opinion is that this matter requires further legal advice before action.",
          "Recommendation is to defer the decision until counsel's view is on file.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.every((m) => m.text.length >= 20)).toBe(true);
  });

  it("drops sentences above the 800-char ceiling (post-Fix-2 sentence-level cap)", () => {
    // Pathological synthetic single-token "sentence" with no internal
    // boundary — would otherwise pass line guards but exceeds the
    // sentence-level ceiling. Real council prose has periods every
    // ~80 chars so this case is contrived; the cap is a backstop.
    const longSentence = "a".repeat(801) + ".";
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          longSentence,
          "Officer's candid opinion is that the application has merit but requires careful balancing.",
          "Recommend approval with conditions tailored to the unique circumstances of this case.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.every((m) => m.text.length <= 800)).toBe(true);
  });

  it("body line matching a marker phrase opens a new (sub)section, not a candidate", () => {
    // Post-2026-04-27 algorithm: any marker-matching line flushes
    // current section + opens new. So an embedded "(free and frank)"
    // body line opens a sub-section that gets evaluated under the
    // ≥2-candidate minimum like any other section. This sidesteps
    // the marker-echo concern without a dedicated guard.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Officer's candid opinion is that the proposal merits approval on balance of evidence.",
          "Recommendation is to approve subject to standard environmental conditions.",
          // Embedded marker echo — opens a NEW (sub)section.
          "(free and frank addendum)",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    // First section: 2 candidates → 2 matches.
    // The marker-echo line opens a sub-section; "Conclusion" terminates
    // it before any candidates accumulate → 0 matches from the sub-section.
    expect(result.length).toBe(2);
    expect(result.every((m) => m.text.startsWith("Officer's") || m.text.startsWith("Recommendation"))).toBe(true);
  });

  it("requires ≥2 candidate sentences (single-line metadata-style mentions are dropped)", () => {
    // B1 page 1's borderline case: a classification-line metadata
    // mention of the marker phrase, NOT followed by section body.
    // This whole region must yield zero detections.
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Classification: legal privilege, s7(2)(f) free and frank",
          "Investigator: Sarah Mitchell, HR Manager",
          "Date: 12 March 2026",
          "Reference: HR-INV-2026-018",
        ].join("\n"),
      ),
    ]);
    // Either 0 candidate body sentences (terminators / FP-guards
    // catch everything) or 1 (still below the ≥2 minimum). Either
    // way, the section is dropped — this is the metadata-vs-real-
    // section distinguisher from §4.
    expect(result.length).toBe(0);
  });

  it("emits zero matches for a section header with no body content at all (orphan header)", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "6. Candid commentary (free and frank)",
          "",
          "",
          "7. Recommendations",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(0);
  });

  it("emits zero matches when the body has only one candidate (below the ≥2 minimum)", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "6. Candid commentary (free and frank)",
          "Officer's candid opinion is that the application should be approved.",
          "7. Recommendations",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §7 — confidence floor
// ---------------------------------------------------------------------------

describe("detectSectionMarkers — confidence", () => {
  it("emits matches with confidence 75 (below AI's typical 85+ for free-frank)", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Officer's candid opinion is that the matter should be declined for policy reasons.",
          "Recommend further consultation before any decision is communicated externally.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
    expect(result.every((m) => m.confidence === 75)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §8 — Integration / typed-toggle gating
// ---------------------------------------------------------------------------

describe("detectSectionMarkers — type gating", () => {
  it("returns empty when free-frank is not in enabledTypes", () => {
    const result = detectSectionMarkers(
      [
        page(
          1,
          [
            "Officer commentary (free and frank)",
            "Officer's candid opinion is that the application should be approved.",
            "Recommend approval subject to standard conditions.",
            "Conclusion",
          ].join("\n"),
        ),
      ],
      new Set(["personal-name", "phone"]),
    );
    expect(result).toEqual([]);
  });

  it("returns matches when free-frank is in enabledTypes", () => {
    const result = detectSectionMarkers(
      [
        page(
          1,
          [
            "Officer commentary (free and frank)",
            "Officer's candid opinion is that the application should be approved.",
            "Recommend approval subject to standard conditions.",
            "Conclusion",
          ].join("\n"),
        ),
      ],
      new Set(["free-frank", "personal-name"]),
    );
    expect(result.length).toBe(2);
  });

  it("returns matches when enabledTypes is undefined (all types active)", () => {
    const result = detectSectionMarkers([
      page(
        1,
        [
          "Officer commentary (free and frank)",
          "Officer's candid opinion is that the application should be approved.",
          "Recommend approval subject to standard conditions.",
          "Conclusion",
        ].join("\n"),
      ),
    ]);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Robustness — empty / null / pathological inputs
// ---------------------------------------------------------------------------

describe("detectSectionMarkers — robustness", () => {
  it("handles an empty pages array", () => {
    expect(detectSectionMarkers([])).toEqual([]);
  });

  it("handles pages with empty text", () => {
    expect(detectSectionMarkers([page(1, "")])).toEqual([]);
  });

  it("handles pages with only blank lines", () => {
    expect(detectSectionMarkers([page(1, "\n\n\n\n")])).toEqual([]);
  });

  it("handles a section header with no following text", () => {
    expect(detectSectionMarkers([page(1, "Officer commentary (free and frank)")])).toEqual([]);
  });

  it("handles CRLF line endings as well as LF", () => {
    const result = detectSectionMarkers([
      page(
        1,
        "Officer commentary (free and frank)\r\nOfficer's candid opinion is that the application should be approved.\r\nRecommend approval subject to standard conditions.\r\nConclusion\r\n",
      ),
    ]);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Eugene clarification 2 — B1-style self-justification paragraph
// ---------------------------------------------------------------------------

describe("detectSectionMarkers — B1-style self-justification (Eugene clarification 2)", () => {
  it("captures the section's `provided to the CE only … chill future candour` framing as a candidate", () => {
    // This is the literal opening framing of B1 page 3's Section 6
    // (verified against the dev DB). The diagnosis report flagged
    // this paragraph as something the AI also misses; the
    // deterministic detector should pick it up because it sits in
    // the body region, is well over the 20-char floor, isn't a
    // bullet / attribution / date line, and isn't itself a marker
    // echo.
    const result = detectSectionMarkers([
      page(
        3,
        [
          "6. Candid investigator commentary (free and frank)",
          "This section is provided for the Chief Executive only and is not part of the formal findings. It would materially chill future investigator candour if it were released (s7(2)(f)):",
          "In my assessment Mr Kellogg's conduct crosses the line of what is acceptable, but this is not a clear-cut case.",
          "Both parties have credibility issues.",
          "Ms Ferguson has a reputation among her peers for being abrasive and for escalating minor disagreements.",
          "Two witnesses (not named in the formal findings to avoid retaliation) described her management style as exhausting.",
          "That does not excuse the conduct complained of, but it is relevant context for any remedy.",
          "My honest read is that this matter is better resolved by a facilitated conversation and a formal written warning, rather than by dismissal.",
          "A dismissal would almost certainly result in a personal grievance and, given the mixed evidence, Council would be exposed to a significant settlement risk.",
          "Bens initial estimate is that our settlement range in the event of a PG is large.",
          "7. Recommendations",
        ].join("\n"),
      ),
    ]);

    // The framing paragraph + 6+ subsequent opinion sentences should
    // all fire. Loose-bound assertion to leave room for the very-
    // short "Both parties have credibility issues." line which is
    // exactly 36 chars — comfortably above the 20-char floor.
    expect(result.length).toBeGreaterThanOrEqual(7);

    // The framing paragraph is the most important positive case.
    expect(
      result.some((m) =>
        m.text.startsWith(
          "This section is provided for the Chief Executive only",
        ),
      ),
    ).toBe(true);

    // Spot-check the six expected free-frank entries from the bench
    // ground-truth file (all should be captured).
    const captured = result.map((m) => m.text);
    expect(captured.some((t) => t.includes("Mr Kellogg's conduct crosses the line"))).toBe(true);
    expect(captured.some((t) => t.includes("Both parties have credibility issues"))).toBe(true);
    expect(captured.some((t) => t.includes("Ms Ferguson has a reputation"))).toBe(true);
    expect(captured.some((t) => t.includes("management style as exhausting"))).toBe(true);
    expect(captured.some((t) => t.includes("My honest read is that this matter"))).toBe(true);
    expect(captured.some((t) => t.includes("Council would be exposed to a significant settlement risk"))).toBe(true);
  });
});
