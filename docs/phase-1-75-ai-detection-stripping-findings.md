# Phase 1.75 — AI detection stripping diagnostic

**Date:** 2026-04-20
**Status:** Read-only investigation. Fix not applied. Awaiting Eugene's approval of direction.
**Scope:** Diagnose why long-narrative AI detections never reach the `Detection` table, as surfaced by the baseline in PR #18 (`docs/bench-baselines/baseline-2026-04-20/`).

---

## TL;DR

**Root cause:** `lib/pipeline/bbox.ts:24` short-circuits coordinate calculation when `detectionText.length > 80` by returning an **empty array** (`empty: BBox[]`). In `lib/pipeline/process.ts:660–670`, the caller iterates over the returned bbox list and pushes one `enrichedDetections` entry per bbox. Empty array → zero iterations → detection is silently **dropped before storage**.

**The CLAUDE.md narrative ("short-circuit to zero bbox and fall through to Tier 2 text-search") is not what the code does.** The code drops the detection entirely. The drop happens long before any redaction decision and is hidden from the pipeline logs — the "AI detection complete" count is pre-enrichment, "Detections stored" is post-enrichment-and-dedup.

**Proposed fix:** One line change in `lib/pipeline/process.ts` to fall back to a single zero-bbox placeholder when `calculateBBoxAll` returns empty. One assertion relaxation in the canonical-pdf integration test. ~15 LOC total.

**Predicted bench impact:** C1 F1 `0.000 → ~0.35`, A F1 `0.095 → ~0.40`, B2 F1 `0.588 → ~0.62`, B1 F1 `0.241 → ~0.25` (small). Commercial pathway ~0.40, governance pathway ~0.30. Enforcement/personal unchanged.

**Recommendation:** Same-session apply after Eugene approves. It's a small, isolated change with a passing-test path, and the benchmark will quantify the lift before Phase 3 starts.

---

## Pipeline flow trace

### Step 1 — AI detection completes

`lib/pipeline/process.ts:546–552`. `detectWithAI` returns an array shaped `{ type, text, page, confidence, suggestedGround, reasoning, piConsideration, aiExplanation }`. The `"AI detection complete"` log entry at `process.ts:552` prints `aiDetections.length` — **this is the number before any filtering**.

### Step 2 — Unified detection list

`lib/pipeline/process.ts:623–657`. Pattern, AI, and custom-rule matches are flattened into a single `allDetections: UnifiedDetection[]` array. Still no filtering.

### Step 3 — Bbox enrichment (THE DROP POINT)

`lib/pipeline/process.ts:660–670`:

```typescript
const enrichedDetections: (UnifiedDetection & { posX; posY; posW; posH })[] = [];
for (const det of allDetections) {
  const layout = pageLayouts.get(det.page);
  const bboxes = layout
    ? calculateBBoxAll(det.text, layout.words, layout.width, layout.height)
    : [{ posX: 0, posY: 0, posW: 0, posH: 0 }];

  for (const bbox of bboxes) {
    enrichedDetections.push({ ...det, ...bbox });
  }
}
```

Two branches:

- **No layout for this page** (e.g. non-PDF with empty `pageLayouts` map). Fallback to a single zero-bbox entry — the detection survives.
- **Has layout** (the post-Phase-2 case, which runs DI against the canonical PDF for every supported format — so DOCX / XLSX / EML / MSG / PDF all reach this branch). `calculateBBoxAll` is the only decider. If it returns `[]`, the inner loop runs zero times, and the detection is **dropped without any log entry**.

### Step 4 — `calculateBBoxAll` returns empty for long text

`lib/pipeline/bbox.ts:20–24`:

```typescript
const empty: BBox[] = [];
if (!words || words.length === 0 || !detectionText) return empty;

const target = detectionText.toLowerCase().replace(/\s+/g, " ").trim();
if (!target || target.length > 80) return empty;
```

The 80-char short-circuit returns the same `empty` array used for "no words available." The caller can't tell them apart.

`lib/pipeline/bbox.ts:77–79` adds a second "drop phantom" empty-return path when word-level search genuinely finds no match:

```typescript
if (uniqueBoxes.length === 0) {
  return empty;
}
```

Both conditions return `empty`. Process.ts treats both the same way. The integration test at `lib/pipeline/__tests__/canonical-pdf.integration.test.ts:206–207` asserts `zeroRows.length === 0` and labels it "the Phase-2 shortcut-removal invariant — no phantom (0,0,0,0) rows in Detection output" — so the current behaviour is deliberate for the **phantom** case, but is incidentally also eating the **long-text** case.

### Step 5 — Dedup + insert (unchanged)

`lib/pipeline/process.ts:672–723`. Dedup keys on `(page, type, normalised-text, posY_rounded)`, which is safe for zero-bbox rows because the text is part of the key — different long-narrative spans don't collide. Insert is a straight Prisma `create` per deduped entry. `"Detections stored"` logs `total = enrichedDetections.length` — **this is what the baseline reports see**.

### Summary of the discrepancy

| Stage | Where | What it logs | Post-filter? |
|---|---|---|---|
| AI detection | `process.ts:552` | `aiDetections.length` (raw from OpenAI) | no |
| Bbox enrichment | `process.ts:660–670` | **nothing** | **silently drops >80-char** |
| Dedup | `process.ts:691–698` | `before/after/removed` (the dedup keys, not the drops) | — |
| Detections stored | `process.ts:727–731` | `total = enrichedDetections.length` | yes |

The gap between "AI detection complete: 9" and "Detections stored: 0" is the **invisible bbox-enrichment drop**.

---

## Evidence from the baseline (PR #18)

From `docs/bench-baselines/baseline-2026-04-20/` + `/tmp/bench-full.log`:

| fixture | AI produced (per run) | stored (per run) | AI produced (sum) | union |
|---|---|---|---|---|
| B1 | 7 / 8 / 8 | 23 / 22 / 23 | 23 | 23 |
| B2 | 5 / (not logged) / 5 | 13 / 17 / 14 | ~15 | 14 |
| A  | 6 / 7 / 3 | 2 / 2 / 2 | 16 | 2 |
| C1 | 9 / 9 / 8 | **0 / 0 / 0** | 26 | 0 |

B2's AI detections are all ≤53 chars (verified by scanning `B2.run1.detections.json` text lengths). So B2's stored counts match roughly AI+pattern, and its miss profile is a prompt-recall issue (Phase 3 scope) — not the bbox drop.

A and C1 use DOCX inputs with governance/commercial-pathway content. Every missed A entry is a sentence-level free-frank, legal-privilege, or confidential span (all >80 chars). C1's 19 expected entries average 70 chars with a max of 155 — the AI's actual wrapper sentences are longer still.

B1 is a special case — its stored count (23) is inflated by regex matches (phones, IRDs, DLs), and its 7–8 AI contributions per run mostly reach storage because AI-produced names are short. Its FP+FN profile is dominated by prompt gaps (name-in-prose) rather than bbox drops.

This cross-fixture pattern — drop proportional to AI-narrative share, not fixture complexity — matches the bbox-cap hypothesis exactly.

---

## Proposed fix

### Minimal-diff fix

`lib/pipeline/process.ts:660–670`. Explicit short-circuit for long text BEFORE calling `calculateBBoxAll`, preserving the existing "drop phantom" semantics for ≤80-char detections that don't match any word sequence on the rendered page.

```typescript
const enrichedDetections: (UnifiedDetection & { posX; posY; posW; posH })[] = [];
for (const det of allDetections) {
  const layout = pageLayouts.get(det.page);
  let bboxes: BBox[];

  if (!layout) {
    // Non-PDF path with no per-word layout — legacy zero-bbox placeholder.
    bboxes = [{ posX: 0, posY: 0, posW: 0, posH: 0 }];
  } else if (det.text.length > 80) {
    // Long-narrative short-circuit. Matches TEXT_SEARCH_MAX_LENGTH in
    // redact-pdf.ts. Preserves the detection so it reaches the Detection
    // table and the review UI; Tier 1 coord redaction is skipped (bbox is
    // zero); Tier 2 filter at redact-pdf.ts:360 will still skip > 80-char
    // at redact time. That's a separate concern for a future follow-up.
    bboxes = [{ posX: 0, posY: 0, posW: 0, posH: 0 }];
  } else {
    bboxes = calculateBBoxAll(det.text, layout.words, layout.width, layout.height);
  }

  for (const bbox of bboxes) {
    enrichedDetections.push({ ...det, ...bbox });
  }
}
```

This keeps `calculateBBoxAll` pure (its return value continues to mean "word-level coord search result") and pushes the short-circuit decision up into the orchestrator, where the semantic intent ("we aren't going to search coords for this one; store it anyway") is explicit.

### Required test relaxation

`lib/pipeline/__tests__/canonical-pdf.integration.test.ts:206–207`:

```typescript
// Before
const zeroRows = dets.filter((d) => d.posW === 0 && d.posH === 0);
expect(zeroRows.length).toBe(0);

// After
const zeroRowsShortText = dets.filter(
  (d) => d.posW === 0 && d.posH === 0 && d.text.length <= 80,
);
expect(
  zeroRowsShortText.length,
  "no zero-bbox detection should exist for text ≤80 chars (phantom-drop invariant)",
).toBe(0);
// Long-narrative detections are allowed to have zero bbox — that's the
// intentional short-circuit, documented in process.ts bbox enrichment.
```

Same assertion at line 285–286 needs the same treatment.

### Why not modify bbox.ts?

Two reasons:

1. **Separation of concerns.** `calculateBBoxAll` answers "where does this text appear in the layout?". Returning a zero-bbox placeholder on short-circuit would make the return value ambiguous — callers couldn't distinguish "I searched and found nothing" from "I didn't search because the text is too long." That ambiguity is the bug we're fixing.
2. **Alternative call sites.** `bbox.ts` is also used indirectly through the canonical-pdf tests and (in future) the bbox-recompute path when detections are re-enriched against a rebuilt canonical PDF. Giving it a "store even if I can't find it" responsibility spreads the semantics further than necessary.

### Why not remove the 80-char cap entirely?

The cap exists because `calculateBBoxAll`'s inner loop is O(words × 50) and does a toString-normalise per step. Long detection text cuts through real documents hundreds of times without ever matching and wastes CPU. The cap is a correct performance guard on the coord-search path. The bug is that the short-circuit semantics were wrong.

---

## Tradeoffs considered

### 1. Does preserving zero-bbox detections break the UI?

**No.** `components/review/pdf-detection-overlay.tsx:50` already handles zero-bbox detections by returning `null` — the PDF page overlay simply doesn't render a highlight box for them. The list-view components show detection rows regardless of bbox. So a reviewer sees the long-narrative detection in the sidebar list with its text, type, confidence, and suggested ground, but the PDF page view doesn't highlight a region. That's honest — we don't know WHERE on the page the narrative span is (we didn't search, by design), so we shouldn't pretend with a placeholder.

### 2. Does the redaction engine cope with zero-bbox detections at redact time?

**Partially, as of current code.** Tracing `lib/pipeline/redact-pdf.ts`:

- **Tier 1 (`redactCanonicalPdf` / `redactOriginalPdf`)** — `redact-pdf.ts:97–99` filters `usableBboxes` by `posW > 0 && posH > 0`. Zero-bbox detections are correctly skipped from coordinate redaction.
- **Tier 2 (`redactByTextSearch`)** — `redact-pdf.ts:360` filters `det.text.length > TEXT_SEARCH_MAX_LENGTH`, **also 80 chars**. Zero-bbox long-text detections pass Tier 1's filter (bbox check) but are then dropped by Tier 2's length check. They never reach PyMuPDF `search_for`.
- **Tier 3 (`generateTextPdf`)** — `redact-pdf.ts:506` uses `processedLine.includes(redactText)` which WOULD find a verbatim long-narrative span in a line of plain text, but only if Tier 2 had passed it through. Currently it doesn't.

So this fix **lands detections in storage and in the review UI** but leaves **actual redaction of long-narrative spans as-is** (no redaction today, no redaction after the fix). That's OK for the bench — the bench measures detection recall, not redaction correctness — and the status quo for production is no worse than before.

A follow-up PR could relax `TEXT_SEARCH_MAX_LENGTH` to let PyMuPDF attempt long-narrative searches. That's a separate decision with different trade-offs (search perf, match fidelity for paraphrased AI output) and explicitly NOT in this fix's scope.

### 3. Does dedup collide on zero-bbox?

**No.** `process.ts:679` keys the dedup on `${page}|${type}|${text.toLowerCase().trim()}|${posYRounded}`. Different narrative spans produce different text, so different keys, even at posY=0. The only collision is the same text detected by multiple sources (AI + custom-rule), which is exactly what dedup is meant to collapse — it keeps the higher-confidence entry, as intended.

### 4. Is there a better placeholder than (0, 0, 0, 0)?

**No cleaner option without schema changes.** A full-page placeholder (0, 0, 100, 100) would confuse the overlay UI and risk over-redaction if Tier 1 ever accepted it. A page-center placeholder would be arbitrary. An additional column (e.g. `bboxSource: "coord" | "short-circuit" | "none"`) would make the semantics explicit but requires a Prisma migration — out of scope for a one-line fix. (0, 0, 0, 0) is fine because every consumer already checks `posW > 0 && posH > 0` before using the bbox.

### 5. Is it worth logging the short-circuit?

**Yes, one line.** Recommend adding `log.debug` inside the `else if (det.text.length > 80)` branch so a future debugger can see the drop count. Not an `info` level — would swamp logs on AI-narrative-heavy documents. This is an optional niceity, not required for the fix to work.

---

## Predicted bench impact

Using the baseline's AI-produced-per-run counts as the ceiling:

| fixture | current F1 | predicted F1 | delta | rationale |
|---|---|---|---|---|
| B1 | 0.241 | ~0.25 | +0.01 | Already storing most AI detections; gain is edge cases where AI produces >80-char name-in-context spans. |
| B2 | 0.588 | ~0.62 | +0.03 | A few B2 AI spans may be >80 chars (e.g. "Mr Kellogg's conduct..." is 96 chars). Modest lift. |
| A  | 0.095 | ~0.40 | +0.30 | AI produces 6/7/3 → currently stores 2/2/2. Fix restores 4/5/1 per run to storage. Union likely 8–10 additional entries; many match expected via substring. |
| C1 | 0.000 | ~0.35 | +0.35 | AI produces 9/9/8 → currently stores 0/0/0. Fix restores ~25 entries to union; roughly half match expected via substring. |

Per-pathway (all 4 unioned):

| pathway | current F1 | predicted F1 | delta |
|---|---|---|---|
| personal | 0.471 | ~0.52 | +0.05 (small lift on address/full-name-DOB spans). |
| commercial | 0.000 | ~0.40 | +0.40 (all C1 commercial detections become visible; precision depends on how many AI spans overlap expected entries). |
| governance | 0.044 | ~0.30 | +0.25 (A free-frank + legal-privilege spans now reach storage). |
| enforcement | 1.000 | 1.000 | 0 (nothing to change — enforcement content is short identifiers). |

**Caveats:** these are upper-bound estimates. Actual lift depends on how tightly the AI's wrapper sentences align with the hand-authored expected substrings. Precision may soften as long-narrative false positives enter the FP column. Bench run after fix will give the real number.

---

## Risks

- **Redaction no-ops on long narratives** — the review UI shows the detection but accepting it won't redact anything visible in the output PDF (Tier 2 drops it, Tier 3 only runs when Tier 2 fails, and only matches verbatim). This is status quo today — the detection simply isn't reaching the UI, so nothing was being redacted either. The fix makes the gap visible rather than creating it. Mitigation: a follow-up PR removes the Tier 2 length cap so PyMuPDF attempts a search; the search cost is bounded per-document and PyMuPDF returns fast on no-match.
- **Integration-test invariant change** — the "no phantom (0,0,0,0) rows" assertion was intentional. The fix relaxes it to "no phantom rows for text ≤80 chars." This is a deliberate semantic shift documented in the new test comment. If any other test-suite (Playwright e2e, bench, etc.) implicitly depends on zero-bbox-never-happens, it needs to be audited. Grep shows only the two integration-test assertions + the overlay component's `return null` guard — no other implicit dependency.
- **Review UX for long-narrative detections** — reviewers will see detection rows with no highlighted region on the PDF. UX-wise they get the detection text in the sidebar and the "accept" button; they just can't click a highlight. That's defensible for sentence-level free-frank content (which isn't a spot-redaction anyway), but worth flagging to Eugene before shipping. No UX change needed in this PR; Phase 3's prompt work should emit tighter substrings as a side-effect, reducing the long-narrative share over time.
- **Post-fix precision regression** — if the AI emits lots of overly long rambling spans, we'll see FPs grow on B1/B2. The benchmark scoring will catch this quickly; if precision drops below ~40% on any pathway, back the fix out and reconsider (e.g. add a soft character cap in the prompt).

---

## LOC estimate

- `lib/pipeline/process.ts`: +9 / −4 (the `if` chain + a comment block).
- `lib/pipeline/__tests__/canonical-pdf.integration.test.ts`: +6 / −2 (two test relaxations, matching comments).

**Net: ~15 LOC across 2 files.** No schema change, no new modules, no dependency change.

---

## Recommendation

**Apply this fix in the same session**, under Eugene's approval of the direction. Justification:

- The fix is small (~15 LOC) and isolated (one production file + one test file).
- The bench suite is live — we can measure the lift immediately rather than hypothesise about it.
- Capturing the post-fix number before Phase 3 starts gives Phase 3 a clean "prompt change" A/B rather than a compound "prompt + pipeline" A/B that would be hard to attribute.
- The change is reversible (revert the two files) if the benchmark shows precision tanking.

If Eugene prefers to spin a separate tranche, the work is cleanly scoped to:

1. Apply the two-file change above.
2. Run `npm run bench:suite -- --output-dir docs/bench-baselines/post-phase-1-75-2026-04-20/` and diff against PR #18's baseline.
3. Commit baseline + fix in one PR with a before/after table in the body.

Either way, no Phase 3 work should be attempted before this fix lands — a fix for which the benchmark would show a zero-or-negative delta would distort Phase 3's evaluation.
