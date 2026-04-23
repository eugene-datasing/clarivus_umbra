# Detection Coverage Plan — 2026-04

**Source request:** Raise detection coverage quality across Veil's three detection sources (regex patterns, AI, document classification) so that investigation-style fixtures like B1 get redacted with substantially better recall.
**Repo:** `/Users/eugenecash/dev/Agent-teams/veil-product-design/outputs/prototype/veil-prototype/`
**Drafted:** 2026-04-20 (v3 — after peer review and model-choice spike outcome).
**Sibling plan in flight:** `docs/viewer-rework-plan-2026-04.md`.

---

## Status as of 2026-04-23

Phase 3 is complete. What remains is Phases 4/5/6. The executive summary and phase sections below describe the plan as originally drafted; use this status block as the orientation for what's done and where a fresh session should pick up.

**Shipped:**

- **Phase 0 — model-choice spike (o4-mini):** resolved. Stayed on gpt-4o. Spike artefacts at `docs/spike-model-comparison-2026-04-20/`; runner at `scripts/spike-o4-mini.ts`. A `buildCanonicalPdf` guard for future spike / bench harnesses is tracked as issue #14 (low priority).
- **Phase 1 — hotfixes** (landline regex, toggle defaults, env-var split, single-batch guard): shipped. Deployed as cr16 (landline hotfix) + cr17 (bundle).
- **Phase 1.5 — extraction-quirk investigation:** resolved. Was a spike-harness artefact (the spike script called `extractText(buf, "DOCX")` which uses the mammoth single-page path, not the production `buildCanonicalPdf` + DI-on-canonical flow). Not a production pipeline bug. Findings at `docs/phase-1-5-extraction-findings.md`.
- **Phase 1.75 — AI detection bbox-stripping fix:** shipped, deployed as cr18. Long-narrative AI detections (text > 80 chars) were silently dropped before storage by an empty-array return from `calculateBBoxAll`; fix emits a zero-bbox placeholder so detections survive. Downstream follow-up filed as issue #20 — Tier 2 `TEXT_SEARCH_MAX_LENGTH` cap at `redact-pdf.ts:360` still skips long text at auto-redact time, so long-narrative detections currently reach the review UI but rely on the manual-detection flow for redaction. Findings at `docs/phase-1-75-ai-detection-stripping-findings.md`.
- **Phase 2 — benchmark harness** (scoring library, pipeline invoker, bench-suite CLI, CI regression guard, 5 fixtures B1/B2/A/C1/B3, baselines committed): complete. CI workflow at `.github/workflows/bench-detection.yml` runs on every PR touching `lib/pipeline/**`, `test-fixtures/bench/**`, `docs/bench-baselines/**`, `scripts/bench/**`, or `lib/bench/**`.
- **Phase 3 PR A — cache-friendly prompt restructure + labelled-values hint** (PR #26): merged. `buildClassificationContext()` output moved to the tail of the system prompt so the ~3000-token stable prefix becomes eligible for Azure OpenAI prompt caching (≥1024-token, 5-minute TTL). Personal-name type description extended with "labelled values in tables" language to prepare for PR B's Example 12.
- **N=10 canonical rebaseline (issue #27, PR #28, commit `22bb840`):** merged. Per-fixture CI threshold dropped 16pp → 12pp. The N=10 capture replaced a single-run point-estimate anchor sitting at the top of B2's 15.1pp distribution; observed low-side deviation from the median canonical is now ≤7pp worst-case. Capture script at `scripts/bench/bench-canonical-capture.ts`.
- **Phase 3 PR B — governance-pathway content lift** (PR #29, commit `ef45c1b`): **merged**. Reworded council-official carve-out distinguishing council-own / third-party-professional / investigator-in-grievance; 11 new worked examples (9–19 including the v3.2 medical-diagnosis pattern); structural-heuristics block with a tightened "protect candour, not procedure" qualifier on free-and-frank sections; B1.expected.json retune (Sarah Mitchell personal-name → harassment-risk). Post-PR-B N=10 canonical captured and `docs/bench-baselines/CANONICAL` now points at `baseline-2026-04-23-post-phase-3-median-N10`. Landed numbers:
  - **Governance pathway median F1: 0.345** (prev 0.337, +0.7pp). Judgment-zone outcome (0.337 ≤ g < 0.357); accepted with Phase 4 entity propagation inheriting 0.345 as its new governance starting point.
  - **Commercial pathway: +6.5pp** (0.413 → 0.478) from Examples 16 and 18 firing.
  - **Personal pathway: +1.7pp** (0.650 → 0.667) from the reworded carve-out releasing third-party professionals.
  - **B1 fixture: +6.6pp** (0.325 → 0.391), driven by the Mitchell retune + reworded carve-out.
  - **B2 variance meaningfully tightened: stddev 6.1pp → 2.0pp** even as its median moved −1.3pp (0.584 → 0.571). More consistent output on B2 is a durability win.
  - Suite aggregate F1 0.516 → 0.521 (+0.005). All five fixtures within the 12pp per-fixture CI gate.
  - Watch-item: **C1 variance widened** (stddev 5.5pp → 9.1pp, low-side 8.8pp approaching the 12pp gate). Not a blocker; monitor in Phase 4/5 work.

**Next work:** Phase 4 entity propagation (see the Phase 4 section for the full scope). Governance pathway anchor for Phase 4 success measurement is **0.345**, not 0.337 — any lift Phase 4 delivers on governance stacks on top of PR B's 0.007 gain.

**Outstanding issues:**
- Issue #20 — Tier 2 `TEXT_SEARCH_MAX_LENGTH` follow-up. Priority medium. Completes the auto-redaction loop for long-narrative detections that PR B now produces more of.
- Issue #14 — `buildCanonicalPdf` guard for spike / bench harnesses. Priority low. Prevents recurrence of the Phase 1.5 spike-harness artefact.

---

## Executive summary

B1 (HR investigation fixture, 4 visual pages → 1 canonical page post-extraction) miss pattern exposes structural gaps in all three detection sources, not a single broken regex. The free-and-frank and legal-privilege sections are missed because the AI has no worked examples for HR-investigation candid commentary, no worked examples for privileged settlement ranges, and no structural heuristic to treat a section literally labelled "(free and frank)" as a block of strong candidates. The respondent's passport "LA429183" was originally missed because `nz-passport` is default-off in `DEFAULT_DETECTION_TOGGLES` (`lib/data/settings.ts:78`, confirmed in pre-plan recon); the GP landline "(06) 759 2217" is missed because the current phone regex (`lib/pipeline/patterns.ts:115`) cannot cross a `)` character between the prefix and the digits — empirically verified in this planning session. Ben Mahuika (external counsel) and Dr Sarah Liang (third-party GP) are missed because the prompt's "do not flag council officials" instruction does not carve out third-party professionals — the 2026-04-20 model-choice spike confirmed this is a prompt issue, not a model-capability issue.

The fix is layered across seven phases. Phase 0 is resolved (see below). Phase 1 ships regex and toggle hotfixes and a single-batch guard for small documents. **Phase 1.5 is new:** investigate why B1 extracted to a single canonical page so Phase 4's cross-batch propagation premise can be confirmed or rejected. Phase 2 productionises the benchmark harness that doubles as a CI regression guard and now absorbs ground-truth authoring that was formerly in Phase 0. Phase 3 applies a targeted prompt rework including a mandatory third-party-professional carve-out. Phase 4 is contingent on Phase 1.5's outcome; if extraction universally collapses short-to-medium DOCX to single pages, Phase 4 becomes a deferred follow-up. Phase 5 adds a label-adjacent detection source via regex-over-raw-text (no DI-tier upgrade). Phase 6 migrates AI detection output to strict JSON schema if Azure OpenAI on our apiVersion supports it.

### Phase 0 spike outcome — model-stay decision

The Phase 0 model-choice experiment was executed on 2026-04-20 against `o4-mini` on Azure `eastus`, comparing against the production `gpt-4o` baseline on `australiaeast`. Three runs per condition, single-batch per run, using the production `buildSystemPrompt()` with no changes. Raw outputs, per-run JSON, and the comparison markdown sit at `docs/spike-model-comparison-2026-04-20/`. **Outcome:** o4-mini did not clear the ≥15-percentage-point recall-lift threshold on governance-pathway types — gpt-4o matched on legal-privilege (3/3 vs 3/3 Ben-Mahuika-flag runs) and beat on free-and-frank (3/3 vs 2/3). o4-mini's only wins were on third-party-professional detection (Dr Sarah Liang 2/3 vs 0/3; Ben Mahuika as dedicated `personal-name` 1/3 vs 0/3) and on parenthesised-area-code phone (3/3 vs 1/3). **Decision: stay on gpt-4o.** Reconsider when GPT-5 or Claude Sonnet 4.5 becomes available on Azure australiaeast, or if a procurement posture change permits Anthropic API access. o4-mini is also ruled out for synchronous user-facing detection regardless of quality wins: ~5.4× slower per batch (61s median vs 11s) — see Decision (h). The third-party-professional reword that o4-mini made visible is now mandatory in Phase 3.

**Total plan effort: 24–35 engineer-days; approximately half remains as of 2026-04-23 (Phase 3 PR B + Phases 4/5/6).** For one engineer working full-time with Claude Code assistance, over ~5–7 calendar weeks end-to-end. Phase 0 collapses to 0.5 days (spike resolved it); Phase 1.5 is new at 0.5–1 day; Phase 2 absorbs ground-truth authoring formerly in Phase 0 plus the new C1 commercial-pathway fixture, growing to 6–9 days; Phase 3 grows to 4–6 days with three additional worked examples (commercial, health-safety, obligation-of-confidence) and expanded structural heuristics; Phase 5 is 3–4 days after committing to regex-over-raw-text label detection.

**Critical path:** Phase 0 (resolved by spike) → Phase 1 (hotfix; parallelisable with 1.5) → Phase 1.5 (extraction-quirk investigation) → Phase 2 (benchmark harness productionised, ground-truth authoring) → Phase 3 (prompt rework) → Phase 4 (entity propagation — contingent on Phase 1.5) → Phase 5 (label-adjacent detection) → Phase 6 (structured outputs). Phases 4 and 5 can parallelise once Phase 2's harness exists. Phase 6 is a hardening track that can slip without blocking the rest.

---

## Incident context — B1 miss enumeration

B1 is a 4-page (visual) HR investigation fixture that extracts to a single canonical page via LibreOffice + DI (5,694 chars). Observed detection misses from the 2026-04-20 spike, grouped by probable root cause:

**Structural — cross-batch entity continuity (unvalidated by spike):**
- Every in-prose "Ms Ferguson" / "Mr Kellogg" originally reported as missed. Spike result: each model flags "Melissa Ferguson" / "David Kellogg" as `personal-name` once per run (3/3 both models). Because B1 extracts to a single batch, cross-batch entity continuity hypothesis is *not tested* by this spike — see Phase 1.5.
- Witness names in body prose: Angela Torres, Jonathan Briggs, Priya Sharma, Mere Rauhihi. Spike result: **0/3 flagged in detection `text` field** by either model; names sometimes appear in `aiExplanation` reasoning but are not redacted spans.

**Structural — section-level heuristics absent:**
- Entire free-and-frank section, despite the literal heading "(free and frank — s7(2)(f))". Spike result: gpt-4o flagged as `free-frank` in 3/3 runs; o4-mini 2/3. Needs strengthening via structural heuristics and worked examples.
- Legal-privileged settlement figures "$55,000 — $110,000" attributed to Ben Mahuika's privileged advice. Spike result: flagged inside the free-frank sentence 2/3 both models, never as a dedicated `legal-privilege` flag of the settlement range alone.

**Structural — labelled-field pattern:**
- DOB "14 June 1983" in a row labelled "Date of birth". Spike result: **3/3 both models** flag as `personal-name`. Caught.
- DOB "3 November 1978" in a row labelled "Date of birth". Spike result: **3/3 both models** flag as `personal-name`. Caught.
- Respondent passport "LA429183" in a row labelled "NZ Passport". Spike result: **3/3 both models** flag as `nz-passport`. Caught.
- Driver licence "EA123456" in a labelled row. Spike result: **0/3 both models**. AI alone misses — Phase 1's driver-licence regex will catch it deterministically when the full pipeline runs (AI-only spike does not exercise pattern layer).
- Employee numbers "ADC-2284" / "ADC-0917" in labelled rows. Spike result: **0/3 both models**. No regex; AI miss in both. Phase 3 prompt rework (labelled-employee-number example) + Phase 5 label-adjacent detection both target this.

**Regex — parenthesised area code:**
- GP phone "(06) 759 2217". Spike result: gpt-4o 1/3, o4-mini 3/3 (AI-level — the full pipeline with Phase 1's regex fix catches all formats deterministically).

**Pattern not present at all:**
- ICD-10 diagnostic code "F43.23". Spike result: gpt-4o 1/3 (as `health-safety`), o4-mini 0/3. AI-variance miss; no regex.
- Benestar session reference "BEN-48291". Spike result: **0/3 both models**.

**AI — prompt carve-out suppresses third-party professionals:**
- Ben Mahuika (external counsel, Holroyd Partners). Spike result: gpt-4o 0/3 as dedicated `personal-name` (incidental catch via `legal-privilege` sentence 3/3); o4-mini 1/3 as dedicated `personal-name`, 3/3 via `legal-privilege` sentence. **Confirms Phase 3 item 12 (third-party-professional reword) is the right fix.**
- Dr Sarah Liang (third-party GP). Spike result: gpt-4o 0/3; o4-mini 2/3 as `personal-name`. **Confirms the prompt carve-out at `lib/pipeline/ai-detect.ts:260` is actively suppressing this class in gpt-4o.** Phase 3's reworded carve-out closes this.
- Sarah Mitchell (investigator who authored the candid section). Spike result: **0/3 both models**. Plausibly suppressed by the same carve-out since she is staff; Phase 3 wording must preserve the "council's own staff" protection without incidentally excluding investigator-in-grievance-context names from `harassment-risk`.

To verify the full miss list, run the Phase 2 benchmark harness against a hand-authored `B1.expected.json` once Phase 2 ships.

---

## Validated hypotheses

### Hypothesis A — Phone landline regex fails on parenthesised area codes

**Confirmed.** Current regex at `lib/pipeline/patterns.ts:115`:

```regex
/(?<![0-9-])(?:\+?64|0)[\s-]?(?:\d[\s-]?){7,9}(?![0-9-])/g
```

Empirically verified during plan drafting:

| Input | Current regex | Proposed regex |
|---|---|---|
| `(06) 759 2217` | ❌ miss | ✓ hit |
| `(04) 123 4567` | ❌ miss | ✓ hit |
| `+64 (6) 759 2217` | ❌ miss | ✓ hit |
| `06 759 2217` | ✓ hit | ✓ hit |
| `06-759-2217` | ✓ hit | ✓ hit |
| `+64 6 759 2217` | ✓ hit | ✓ hit |
| `027 123 4567` | ✓ hit | ✓ hit |
| `021 123 4567` | ✓ hit | ✓ hit |
| `1234567890` (raw) | ❌ miss | ❌ miss |
| `12-345-678` (IRD shape) | ❌ miss | ❌ miss |

Proposed fix — extend the separator class to include parentheses:

```regex
/(?<![0-9-])\(?(?:\+?64|0)\)?[\s)(-]*(?:\d[\s)(-]*){7,9}(?![0-9-])/g
```

Spike corroboration: o4-mini flagged `(06) 759 2217` 3/3 vs gpt-4o's 1/3, indicating both models are unreliable on this format in prose — regex fix in Phase 1 is the correct primary mitigation. Delivered in Phase 1.

### Hypothesis B — Strict JSON Schema structured outputs

**To verify.** See Phase 6. Verification procedure: probe call with `type: "json_schema"` and `strict: true`. If the 2024-10-21 apiVersion rejects, bump to 2024-12-01-preview or later.

### Hypothesis C — Three-page batching without cross-batch state breaks entity propagation

**Not validated by the 2026-04-20 spike.** `lib/pipeline/ai-detect.ts:465` fixes `BATCH_SIZE = 3`, so on docs with >3 pages post-extraction the boundary would split context. However, B1 extracted to a single canonical page (5,694 chars) — all 6 spike runs were single-batch. The cross-batch scenario was therefore not exercised. **Phase 1.5 investigates whether B1's single-page extraction is a legitimate document-length artefact or a systemic pipeline quirk that collapses short-to-medium DOCX.** Phase 4 (entity propagation) is contingent on that outcome.

If Phase 1.5 concludes the pipeline collapses, Hypothesis C remains theoretically plausible for longer documents (>~30k chars after extraction, roughly ≥10-page Word doc) but is not the dominant cause of B1's misses. Phase 4 would then shift to a follow-up with an explicitly authored multi-batch fixture.

If Phase 1.5 concludes B1's single-page extraction is legitimate and multi-page docs extract to multiple batch-forcing pages normally, Hypothesis C stands and Phase 4 proceeds as drafted.

### Hypothesis D — "Do NOT flag labels" instruction suppresses labelled-field values

**Partially confirmed.** Spike result: labelled DOBs and passport flag 3/3 both models — the instruction is not causing those specific misses. Labelled driver licence and labelled employee numbers still miss 0/3 both models, suggesting the model struggles when the value is itself structured (alphanumeric) rather than calendar-shaped. Phase 3's new worked examples 12–14 (labelled DOB, labelled employee number, labelled driver licence) provide explicit precedent for all three shapes; Phase 5 (label-adjacent regex detection) covers the deterministic fallback for structured values.

### Hypothesis E — Free-and-frank and legal-privilege miss: examples and structural heuristics

**Confirmed.** Spike result for free-and-frank: gpt-4o 3/3, o4-mini 2/3 — detection exists but neither model is 100% reliable on this pathway, and both under-detect the individual spans inside the section (they flag one sentence-level block rather than each sub-sentence-level candidate). Phase 3's ten new worked examples + structural-heuristics block target this.

### Hypothesis F — Separate deployment env vars for classification vs detection

**Confirmed desirable.** Spike-outcome-impacted: with the model-stay decision for gpt-4o, the immediate need for separate env vars is lower. Still worth shipping in Phase 1 as future-proofing — costs nothing, unblocks any later model-split decision.

---

## Phase 0 — Model choice (spike-resolved)

### 1. Scope and success criteria

Resolved by the 2026-04-20 spike documented at `docs/spike-model-comparison-2026-04-20/comparison.md`. **Decision: stay on gpt-4o for detection.** Reconsideration triggers:
- GPT-5 becoming generally available on Azure australiaeast (to verify release / region rollout).
- Claude Sonnet 4.5 (or later Claude generation) becoming available on Azure australiaeast.
- A procurement posture change permitting Anthropic API access under NZ data-sovereignty requirements.
- A new investigation-style fixture, introduced to the benchmark, showing a governance-pathway recall ceiling that prompt-rework alone cannot lift.

**Success criterion:** the decision is documented with a stable reconsideration gate; no further bakeoff work runs until one of the triggers fires.

### 2. Schema changes

None.

### 3. File-level change list

**Already in working tree (keep):**
- `lib/pipeline/ai-detect.ts` — two `export` additions on `buildSystemPrompt` and `preparePages`. Zero behaviour change. Required by `scripts/spike-o4-mini.ts`. Retain; they also unblock future spike/benchmark re-use without further edits.
- `scripts/spike-o4-mini.ts` — the spike runner. Retain as the reference implementation for future spikes when a reconsideration trigger fires.

**Existing deliverables under `docs/spike-model-comparison-2026-04-20/`:**
- `comparison.md` — per-run summary, per-type counts, target-detection checklist.
- `gpt-4o-baseline-run{1,2,3}.json` and `o4-mini-run{1,2,3}.json` — raw detection outputs.
- `b1-extracted-pages.json` — cached DI extraction (reusable for follow-up spikes without re-spending DI quota).

**No new files.**

### 4. New or modified API routes

None.

### 5. Pipeline changes

None.

### 6. Coordinate system

N/A.

### 7. Test strategy

The spike runner itself (`scripts/spike-o4-mini.ts`) serves as the regression harness. If a reconsideration trigger fires, re-run with the new candidate deployment's env vars; the cached DI extraction saves the extraction step.

### 8. Rollback plan

N/A. Phase 0 ships only documentation and retains existing working-tree files. Nothing to roll back.

### 9. Effort estimate

**0.5 engineer-days.** Scope is documenting the decision and the reconsideration triggers in this plan; updating `docs/bench-baselines/` with the spike's JSON artefacts as the Phase 2 baseline; confirming the retained files are committed correctly by Eugene's review.

### 10. Dependencies

- **Blocks:** None. All downstream phases can start.
- **Blocked by:** None. Already complete.

---

## Phase 1 — Quick wins (hotfix track)

### 1. Scope and success criteria

Four low-risk, high-value changes that ship in a single cr16 build:

1. **Landline regex fix** (Hypothesis A confirmed) — parenthesised area codes caught.
2. **Toggle-default audit** — `nz-passport` enabled by default; optionally `vehicle-reg`; confirm `driver-licence` default already true (PR #4).
3. **Separate deployment env vars** (Hypothesis F) — `AZURE_OPENAI_DEPLOYMENT_DETECTION` / `AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION` with fallback to `AZURE_OPENAI_DEPLOYMENT`.
4. **Single-batch guard for small docs** (Hypothesis C option i) — when `preparedPages.length ≤ AI_DETECT_SINGLE_BATCH_MAX_PAGES` (default 6), run one AI call instead of splitting into BATCH_SIZE=3 batches. Trivial change at `lib/pipeline/ai-detect.ts:465`.

**Success:** new uploads show landline phones correctly redacted including `(XX)` format. Admin toggle UI shows passport and DL on by default. Deployment env override works (integration test against a mocked client confirms the right deployment is passed). B1 and similarly-sized fixtures process as a single AI batch (already happening per the spike — keep the behaviour stable by making it explicit).

### 2. Schema changes

None.

### 3. File-level change list

**Modified files:**
- `lib/pipeline/patterns.ts:115` — phone regex replacement (verified candidate in Hypothesis A).
- `lib/data/settings.ts:78` — `nz-passport` default flipped to `enabled: true`.
- `lib/data/settings.ts:80` — `vehicle-reg` default flipped to `enabled: true` *(to verify — see decision (f))*.
- `lib/pipeline/ai-detect.ts:48,491` — read from `AZURE_OPENAI_DEPLOYMENT_DETECTION` with fallback chain.
- `lib/pipeline/doc-classify.ts:93,205` — read from `AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION` with fallback chain.
- `lib/pipeline/ai-detect.ts:465` — single-batch guard. `const maxPages = parseInt(process.env.AI_DETECT_SINGLE_BATCH_MAX_PAGES ?? "6", 10); const BATCH_SIZE = preparedPages.length <= maxPages ? preparedPages.length : 3;`
- `lib/config/env.ts` — register the new optional env vars.
- `lib/pipeline/__tests__/patterns.test.ts` — add the 11 regex test cases verified during plan drafting (see Hypothesis A table). Assert `(06) 759 2217`, `(04) 123 4567`, `+64 (6) 759 2217` now match.

**Note on the toggle-default change:** enabling `nz-passport` changes detection behaviour for new documents only. Existing Detection rows are not affected. If the instance admin has already saved the current setting to the `system_settings` row, the new default is irrelevant — the stored value wins. `scripts/check-toggle-settings.ts` (new, ~30 lines) can print the current stored value per instance for audit.

### 4. New or modified API routes

None.

### 5. Pipeline changes

Minor: single-batch guard changes `BATCH_SIZE` to be dynamic rather than const. Functional flow unchanged.

### 6. Coordinate system

N/A.

### 7. Test strategy

**Unit (vitest):**
- `lib/pipeline/__tests__/patterns.test.ts` — extend with the 11 phone test cases from Hypothesis A.
- `lib/pipeline/__tests__/ai-detect.test.ts` — mock test confirming `AZURE_OPENAI_DEPLOYMENT_DETECTION` overrides the shared var when set. Mock test confirming 4-page input fires a single batch.

**Integration:**
- Add one row to the existing canonical-pdf integration test verifying `(06) 759 2217` in a fixture text would match via `detectPatterns`.

**E2E:** None.

**Manual:** Re-run the B1 fixture through the pipeline post-fix; confirm GP landline is detected as `phone` and the full document processes as one AI batch.

### 8. Rollback plan

Revert the commits individually. No schema migration to reverse. Toggle-default changes affect new writes only.

### 9. Effort estimate

**2–3 engineer-days.**
- Regex replacement + 11-case regression test: 0.5 day.
- Toggle defaults flip + audit-script + unit test: 0.5 day.
- Env-var split across two callers + fallback chain + mock test: 0.5 day.
- Single-batch guard + mock test + integration test: 0.5 day.
- Bundling, deploy via `cr16`, smoke verification on live instance: 0.5–1 day.

### 10. Dependencies

- **Blocks:** None. Ships independently.
- **Blocked by:** None.

---

## Phase 1.5 — Extraction-quirk investigation (new)

### 1. Scope and success criteria

Investigate why B1 extracts to a single canonical page (5,694 chars) despite the DOCX visually rendering to 4 pages. The 2026-04-20 spike's single-page result makes Phase 4's cross-batch entity-propagation premise unfalsifiable on B1 alone. **Phase 4 cannot commit to a design until Phase 1.5 concludes whether this is:**

- (a) a legitimate artefact: LibreOffice renders DOCX with tighter pagination than Word, or DI `prebuilt-read` returns single-page blocks for short docs, or the document content genuinely fits on one page post-rendering.
- (b) a pipeline bug: a page-coalescing step in `lib/pipeline/extract.ts` or in the DI adaptor collapses multi-page output into one.
- (c) specific to short DOCX: B1 is under a length threshold that short-circuits multi-page extraction, but longer documents behave correctly.

**Success criterion:** a short finding document at `docs/extraction-investigation-2026-04.md` stating which of (a), (b), or (c) holds, with enough evidence to re-scope Phase 4 confidently. If (b), a concrete bug-fix PR spec. If (a) or (c), a sizing threshold and fixture-authoring recipe for producing a multi-page canonical output.

### 2. Schema changes

None.

### 3. File-level change list

**New files:**
- `docs/extraction-investigation-2026-04.md` — finding document (~50–100 lines).
- `scripts/probe-extraction.ts` — standalone investigation script (~80–150 lines). Takes a DOCX path, runs the production `extractText()` pipeline, and reports: canonical page count, per-page char counts, LibreOffice-generated PDF page count (via `pdfinfo`), DI `prebuilt-read` raw response page count. Emits a small JSON probe report.

**Modified files:**
- None. Read-only investigation.

### 4. New or modified API routes

None.

### 5. Pipeline changes

None. Investigation only.

### 6. Coordinate system

N/A.

### 7. Test strategy

The investigation itself is the test. Probe corpus: B1, B2, plus one longer document (e.g. `test-fixtures/phase2-spike/large-23pg.docx` already in repo). For each, record the three page-count measurements above and diff against the visual Word page count.

### 8. Rollback plan

N/A. Read-only.

### 9. Effort estimate

**0.5–1 engineer-day.**

### 10. Dependencies

- **Blocks:** Phase 4. Phase 2's fixture selection (if Phase 1.5 finds a threshold, Phase 2 knows what size of fixture to author to force cross-batch).
- **Blocked by:** None. Can run in parallel with Phase 1.

---

## Phase 2 — Benchmark harness (productionised) + ground-truth authoring

### 1. Scope and success criteria

Turn the spike-runner infrastructure into a standing tool: a vitest-integrated benchmark that any developer can run to quantify precision/recall changes on the fixed test corpus, and a CI regression guard that fails the build if recall drops more than N percentage points on any fixture. Also absorbs ground-truth authoring that was formerly in Phase 0 (Phase 0 collapsed to a spike outcome).

**Success:** `npm run bench:detection` produces a markdown+JSON report locally in under 15 minutes against the live Azure endpoints (5 minutes typical with `--quick-mode`, which runs a single rep per fixture). A GitHub Actions workflow runs the same bench on every PR touching `lib/pipeline/**` and comments a summary diff on the PR. Realistic runtime per `processDocument` call is 18–76s p95 (per `docs/phase-2-spike-raw.json`).

**Benchmark corpus (must include a fixture that batches):**
- `test-fixtures/dummy-lgoima-pack/B1_HR_Investigation_Report_Kellogg_Ferguson.docx` — already present locally per the spike; allowlist via `.gitignore` using the B2 pattern. **Incident anchor; single-batch post-extraction per spike data.**
- `test-fixtures/dummy-lgoima-pack/B2_Witness_Statement_Torres.pdf` — already tracked (PR #4).
- A **governance-pathway fixture** containing candid internal advice, a cited legal opinion, and at least one section header using a structural-heuristic trigger ("free and frank" / "without prejudice" / "in confidence"). Authoring responsibility moves here from Phase 0. Target filename: `test-fixtures/bench/A_Council_Memo_Candid_Advice.pdf`. 2–3 pages.
- A **cross-batch fixture** specifically for exercising Phase 4's premise — whichever form Phase 1.5 determines produces multi-batch canonical output. Likely candidate: a 10–15-page authored document. Target filename: `test-fixtures/bench/B3_Long_Investigation.pdf`. Content: multi-page investigation with named witnesses appearing on multiple pages, cited external counsel, candid internal commentary in a late section.
- Re-use `test-fixtures/phase2-spike/large-23pg.docx` (synthetic x-filler) for latency / scale probing only — not for recall measurement (it has no PII content).

### 2. Schema changes

None.

### 3. File-level change list

**New files:**
- `lib/bench/scoring.ts` — shared scoring helpers (precision, recall, F1, per-pathway aggregation). Extract from the spike runner's pattern.
- `lib/bench/bench-runner.ts` — reusable runner.
- `scripts/bench/bench-detection.ts` — CLI entry point. Flags: `--fixture-dir`, `--baseline`, `--threshold`, and `--quick-mode` (single rep per fixture, ~3× faster for tight-loop dev iteration).
- `docs/bench-baselines/` — tracked directory holding per-fixture baseline metrics as JSON files. Seeded with the spike's `gpt-4o-baseline-run*.json` as the initial `main`-branch baseline.
- `.github/workflows/bench-detection.yml` — CI workflow. Gated by an Azure-credentials secret.
- `test-fixtures/bench/A_Council_Memo_Candid_Advice.pdf` — new governance fixture (authored).
- `test-fixtures/bench/A_Council_Memo_Candid_Advice.expected.json` — ground truth, authored per Decision (d) hybrid.
- `test-fixtures/bench/B3_Long_Investigation.pdf` — new multi-batch fixture (authored; size guided by Phase 1.5 findings).
- `test-fixtures/bench/B3_Long_Investigation.expected.json` — ground truth.
- `test-fixtures/bench/B1.expected.json` — ground truth, hand-authored by Eugene.
- `test-fixtures/bench/B2.expected.json` — ground truth, Claude-drafted and Eugene-reviewed.
- `test-fixtures/bench/C1_Tender_Evaluation_Commercial.docx` — new 2–3 page synthetic fixture covering the commercial pathway. Must contain at least: one third-party tender bid price with a commercial-confidentiality caveat (Example 16 shape); one trade-secret-adjacent piece of content (e.g. proprietary engineering process or formulation); one council-commercial strategic sentence (e.g. "Council's preferred bidder rank is X subject to referee checks"); one negotiation BATNA-style sentence; optionally one tikanga-Māori reference to validate cultural-sensitivity coverage. Synthetic content is fine — does not need to reflect any real tender.
- `test-fixtures/bench/C1.expected.json` — ground truth, Claude-drafted and Eugene-reviewed per Decision (d) hybrid.

**Modified files:**
- `package.json` — add `"bench:detection": "tsx scripts/bench/bench-detection.ts"`.
- `.gitignore` — allowlist B1 DOCX + the new bench fixtures per the B2 precedent.

### 4. New or modified API routes

None.

### 5. Pipeline changes

None.

### 6. Coordinate system

N/A.

### 7. Test strategy

**Unit:** `lib/bench/__tests__/scoring.test.ts` — precision/recall maths against hand-crafted actual/expected pairs.

**Integration:** The benchmark itself is the integration test. Validated by running against B1/B2/A/B3 on `main` and checking the scores match the spike's manually-audited numbers.

**E2E:** None.

**Manual:** First run on `main` — confirm baselines are captured correctly. Confirm `--quick-mode` completes a 4-fixture run under 5 minutes against live Azure. Attempt a deliberately-regressing pattern change and confirm CI fails with a clear delta report.

### 8. Rollback plan

Disable the CI workflow via `.github/workflows/bench-detection.yml.disabled` rename. Revert the scripts + baselines. No production impact.

### 9. Effort estimate

**6–9 engineer-days**, broken down:
- Bench runner + scoring lib + CI workflow: 3–4 days.
- Ground-truth authoring — B1 (Eugene, ~1 day), A + B3 + C1 (Claude drafts, Eugene reviews ~2 hours each, Claude draft ~0.5 day each): 2–3 days total elapsed.
- New fixture authoring (A, B3, C1 contents): 1.5 days.

### 10. Dependencies

- **Blocks:** Phase 3, Phase 4, Phase 5 all rely on this to quantify their improvement.
- **Blocked by:** Phase 1.5 informs the size/shape of B3 (the cross-batch fixture). Phase 1 is independent. CI-workflow Azure credentials provisioning in GitHub Actions.

**Interaction with CI/CD migration gap:** the deployment pipeline does NOT currently run `npx prisma migrate deploy` (logged in `docs/viewer-rework-plan-2026-04.md`'s implementation log). Phase 2's CI adds a new workflow but does not touch the deploy pipeline — the gap remains. The bench runs against fixtures in-memory; no DB migration dependency.

---

## Phase 3 — Prompt rework

### PR split status

Phase 3 shipped in two PRs; **both merged**.

- **PR A — cache-friendly prompt restructure + labelled-values hint** (PR #26): merged. `buildClassificationContext()` moved to the tail of the system message so the ~3000-token stable prefix is cacheable; personal-name type description extended to explicitly cover labelled values in tables. Zero-intended-behaviour-change.
- **PR B — prompt content rework** (PR #29, commit `ef45c1b`): **merged 2026-04-23**. Carve-out reword + 11 worked examples (9–19) + structural-heuristics block + B1.expected.json Mitchell retune + N=10 canonical re-capture (`baseline-2026-04-23-post-phase-3-median-N10/`). Landed outcome: governance pathway median F1 **0.345** (+0.7pp over 0.337 anchor, judgment-zone accepted); commercial pathway **+6.5pp** (0.413 → 0.478); personal **+1.7pp**; B1 fixture **+6.6pp**; suite aggregate **+0.5pp**; B2 variance meaningfully tightened (stddev 6.1pp → 2.0pp). All five fixtures within the 12pp per-fixture CI gate; C1 variance widened as a watch-item (stddev 5.5pp → 9.1pp) for future reviewers. See the top-of-doc "Status as of 2026-04-23" block for the full landed-numbers summary.

### 1. Scope and success criteria — PR B (merged, retained for historical reference)

Layer additive content changes across the council-official carve-out, worked examples, and a new structural-heuristics block, then re-capture the canonical in the same PR. Every change lives in `lib/pipeline/ai-detect.ts` except the expected.json retune and the canonical folder. PR B is self-contained; no pipeline or schema changes.

**Concrete deliverables:**

1. **Carve-out reword at `lib/pipeline/ai-detect.ts:260`.** Distinguish council's-own-officials (still not flagged) from third-party professionals (now flagged as `personal-name`) and investigator-in-grievance-context staff (now flagged as `harassment-risk`). Exact proposed wording is in §3 below under the modified-files block — carry it in verbatim. Mandatory per spike observation B: gpt-4o flagged Dr Sarah Liang 0/3 and Ben Mahuika 0/3 as dedicated `personal-name` purely because of the current rigid carve-out.

2. **11 new worked examples (9–18 from v3.1 + Example 19 from the v3.2 amendment).** Full JSON-output-shape exemplars sitting between "DETECTION GUIDANCE BY GROUND" and "WORKED EXAMPLES of non-PII detections" in the prompt. Examples 9–18 are drafted verbatim in §3 below. Example 19 — added by the v3.2 amendment — covers medical-diagnosis-in-prose as `personal-name` with ground `s7(2)(a)`:
   > Input text: "Dr Sarah Liang's letter dated 14 March 2026 records a diagnosis of adjustment disorder with mixed anxiety and depressed mood (ICD-10 F43.23) and recommends a graduated return-to-work programme."
   > Output: `{ "type": "personal-name", "text": "a diagnosis of adjustment disorder with mixed anxiety and depressed mood", "confidence": 90, "page": 3, "suggestedGround": "s7(2)(a)", "aiExplanation": "Medical diagnosis attributed to an individual — private health information under s7(2)(a). Flag the diagnosis text; the doctor's name and the ICD-10 code are separate detections." }`

3. **Structural-heuristics block between "DETECTION GUIDANCE BY GROUND" and "WORKED EXAMPLES".** Section-header-aware triggers for free-and-frank / legal-privilege / in-confidence sections plus commercial / health-safety / tikanga-cultural vocabulary. Full draft in §3 below.

4. **B1.expected.json type-agreement retune.** The reworded carve-out and Example 11 will push the AI to type some B1 entries differently from the current ground truth — specifically, witness names appearing alongside grievance-context detail will be flagged as `harassment-risk` (s7(2)(f)(ii)) rather than `personal-name` (s7(2)(a)). Without retuning, the scorer's type-agreement requirement will mis-read these as simultaneous FN + FP. Scope: re-examine every `personal-name` entry in `test-fixtures/bench/B1.expected.json` whose target name co-occurs with grievance detail; update type to `harassment-risk` where Phase 3 intends that outcome. Document the retune in the PR body so reviewers see the semantic shift rather than a stealth loosening.

5. **Post-PR canonical re-capture, folded into the same commit.** Run `npm run bench:canonical -- --samples 10 --output-dir docs/bench-baselines/baseline-YYYY-MM-DD-post-phase-3-median-N10/` against the PR B branch after the prompt and expected.json changes land. Commit the new directory + update `docs/bench-baselines/CANONICAL` in the same PR. Eugene reviews the variance-stats.md alongside the prompt diff. Rationale: the canonical must reflect the new prompt, or CI's first run after merge will fail with a false-positive "regression".

**Success criteria for PR B merge:**

- **Governance-pathway median F1 on the post-PR canonical beats 0.337** (the current median anchor from `baseline-2026-04-23-median-N10/`). Target is ~0.40+ on the post-capture; anything short of +2pp over 0.337 should trigger a wording-tweak iteration before merge.
- **No per-fixture F1 drop exceeds 12pp** against the current canonical when CI runs on the PR (the N=10 capture pre-merge is Eugene's visibility into this; CI then validates).
- **Suite aggregate F1 no worse than −5pp** against the current 0.516 suite median.
- **Third-party professionals now flag reliably.** Dr Sarah Liang, Ben Mahuika, and Sarah Mitchell (investigator) appear as `personal-name` (or `harassment-risk` for Mitchell) in ≥2 of the 10 sample runs per fixture. Spike baseline was 0/3 for each of these under gpt-4o.

**Pre-condition:** Phase 3 PR A merged and cr18 live (both done). Prompt-content changes are additive; backward-compatible with the cached structure.

### 2. Schema changes

None.

### 3. File-level change list

**Modified files:**
- `lib/pipeline/ai-detect.ts:170` — personal-name type description extended to explicitly mention "labelled values in tables" (reinforces the existing DOB addition from PR #4).
- `lib/pipeline/ai-detect.ts:260` — **mandatory reworded council-official carve-out** (spike-driven). Current: "Names of elected officials, chief executives, and senior managers acting in their official capacity should NOT be flagged". Proposed: "Names of **THE COUNCIL'S OWN** elected officials, chief executives, and senior managers acting in their official capacity on council-policy matters should NOT be flagged. Third-party professional service providers named in the document body (external counsel, GPs, specialist contractors, mental health providers, auditors, consultants) ARE flagged as personal-name even when operating in a professional capacity — their identity is not within the council's published-official carve-out. Investigators and HR staff acting in a grievance or disciplinary context ARE flagged when their identity co-occurs with grievance-specific detail (under `harassment-risk`)."
- `lib/pipeline/ai-detect.ts:321–326` (`buildSystemPrompt` implementation) — **cache-friendly restructure**. Move `buildClassificationContext()` output to the end of the system message rather than the start so the long stable prefix becomes eligible for Azure OpenAI prompt caching. Cache-friendly structure:

```
[STABLE PROMPT — cached after 1st call per 5-min TTL]
[GROUNDS REFERENCE — cached]
[WORKED EXAMPLES — cached]
[STRUCTURAL HEURISTICS — cached]
[IMPORTANT CONTEXT — cached]
[JSON OUTPUT SPEC — cached]
---
DOCUMENT CONTEXT (per-doc, uncached):
[classification block — only this portion changes per call]
```

- `lib/pipeline/ai-detect.ts:233–261` — ten new worked examples 9–18:

**Example 9 — HR candid commentary (type "free-frank", ground s7(2)(f)(i)):**
> Input text: "Counsel's view, expressed candidly in our Tuesday meeting, is that Ms Ferguson's personal grievance has substantial merit — we should move to settlement rather than contest at the ERA."
> Output: `{ "type": "free-frank", "text": "Counsel's view, expressed candidly in our Tuesday meeting, is that Ms Ferguson's personal grievance has substantial merit — we should move to settlement rather than contest at the ERA.", "confidence": 85, "page": 2, "suggestedGround": "s7(2)(f)(i)", ... }`

**Example 10 — Legal-privileged settlement range (type "legal-privilege", ground s7(2)(g)):**
> Input text: "Ben Mahuika's advice is that a settlement in the range of $55,000 — $110,000 would be defensible; he recommends we open at $75,000."
> Output: `{ "type": "legal-privilege", "text": "Ben Mahuika's advice is that a settlement in the range of $55,000 — $110,000 would be defensible; he recommends we open at $75,000.", "confidence": 90, "page": 3, "suggestedGround": "s7(2)(g)", ... }`

**Example 11 — Witness identity in grievance context (type "harassment-risk", ground s7(2)(f)(ii)):**
> Input text: "Witness B (a senior staff member who worked under Ms Patel for three years) has documented concerns about her management style."
> Output: `{ "type": "harassment-risk", "text": "Witness B (a senior staff member who worked under Ms Patel for three years) has documented concerns about her management style.", "confidence": 85, "page": 2, "suggestedGround": "s7(2)(f)(ii)", ... }`

**Example 12 — Labelled DOB in a table (type "personal-name", ground s7(2)(a)):**
> Input text (table row): `| Date of birth | 14 June 1983 |`
> Output: `{ "type": "personal-name", "text": "14 June 1983", "confidence": 95, "page": 1, "suggestedGround": "s7(2)(a)", "aiExplanation": "DOB — labelled date of birth in a table; flag the value only, not the 'Date of birth' label." }`

**Example 13 — Labelled employee number (type "confidential", ground s7(2)(a)):**
> Input text (table row): `| Employee number | EMP-2019-0847 |`
> Output: `{ "type": "confidential", "text": "EMP-2019-0847", "confidence": 90, "page": 1, "suggestedGround": "s7(2)(a)", "aiExplanation": "Employee number — internal identifier that can re-identify an individual; flag the value, not the label." }`

**Example 14 — Labelled driver licence in a table (type "driver-licence", ground s7(2)(a)):**
> Input text (table row): `| NZ Driver Licence | HM847219 |`
> Output: `{ "type": "driver-licence", "text": "HM847219", "confidence": 95, "page": 1, "suggestedGround": "s7(2)(a)", ... }`

**Example 15 — Third-party professional in document body (type "personal-name", ground s7(2)(a)) — MANDATORY per spike observation B:**
> Input text: "Dr Sarah Liang of Central Medical Centre certified the complainant unfit to attend mediation on 14 March."
> Output: `{ "type": "personal-name", "text": "Dr Sarah Liang", "confidence": 90, "page": 3, "suggestedGround": "s7(2)(a)", "aiExplanation": "Third-party professional (GP) named in document body; not within the council's published-official carve-out — flag despite professional role." }`

**Example 16 — Commercial / third-party competitive prejudice (type "commercial", ground s7(2)(b)(ii)):**
> Input text: "TenderCo's bid price of $4.2M assumes a 15% margin on installation and includes a $280k contingency for foundation work — this pricing is confidential to TenderCo and was provided to Council on the basis it would not be disclosed."
> Output: `{ "type": "commercial", "text": "TenderCo's bid price of $4.2M assumes a 15% margin on installation and includes a $280k contingency for foundation work — this pricing is confidential to TenderCo and was provided to Council on the basis it would not be disclosed.", "confidence": 90, "page": 1, "suggestedGround": "s7(2)(b)(ii)", "reasoning": "Third-party bid pricing including margin structure and contingency — disclosure would prejudice TenderCo's competitive position in future procurements.", "piConsideration": "Public interest in procurement transparency weighed against commercial harm to the third-party bidder; the confidentiality caveat was an explicit condition of submission.", "aiExplanation": "Third-party tender pricing provided under confidentiality — protect to preserve bidder willingness to engage with council procurements." }`

**Example 17 — Public health-safety protective measure (type "health-safety", ground s7(2)(d)):**
> Input text: "The water treatment plant's backup chlorination threshold is 0.3 mg/L; on sensor failure the system falls back to UV treatment alone for up to 48 hours before a boil-water notice is issued to the affected reticulation zone."
> Output: `{ "type": "health-safety", "text": "The water treatment plant's backup chlorination threshold is 0.3 mg/L; on sensor failure the system falls back to UV treatment alone for up to 48 hours before a boil-water notice is issued to the affected reticulation zone.", "confidence": 90, "page": 1, "suggestedGround": "s7(2)(d)", "reasoning": "Discloses specific fallback thresholds and the 48-hour window during which chlorination is absent — operational detail that could inform deliberate contamination attempts on a public water supply.", "piConsideration": "Public interest in knowing water treatment is occurring can be met at a higher level ('multi-stage treatment with redundant sensing') rather than at the specific threshold and fallback-window level.", "aiExplanation": "Public health-safety measure whose disclosure would undermine it — protects the measures, distinct from s6(d) which protects an individual." }`

**Example 18 — Obligation of confidence / whistleblower (type "confidential", ground s7(2)(c)(i)):**
> Input text: "Submission received from a former building inspector on condition of anonymity: 'I raised concerns about the CCC signoff process at [named commercial site] to my manager in October 2022. I was told the signoff would proceed regardless. I am making this submission on the condition of anonymity due to fear of professional retaliation.'"
> Output: `{ "type": "confidential", "text": "Submission received from a former building inspector on condition of anonymity: 'I raised concerns about the CCC signoff process at [named commercial site] to my manager in October 2022. I was told the signoff would proceed regardless. I am making this submission on the condition of anonymity due to fear of professional retaliation.'", "confidence": 90, "page": 1, "suggestedGround": "s7(2)(c)(i)", "reasoning": "Whistleblower submission explicitly provided under confidentiality; disclosure would prejudice future supply of similar information from current or former inspectors with compliance concerns.", "piConsideration": "Public interest in building-compliance oversight is high; balance against the chilling effect on future whistleblowers willing to submit under anonymity.", "aiExplanation": "Third-party submission under explicit obligation of confidence — s7(2)(c)(i) applies where disclosure would prejudice future similar supply." }`

- `lib/pipeline/ai-detect.ts:231–233` — new structural-heuristics block inserted between "DETECTION GUIDANCE BY GROUND" and "WORKED EXAMPLES":

```
STRUCTURAL HEURISTICS — section-level and labelled-field signals:

- If a section header cites a specific LGOIMA ground (e.g. "Free and frank section (s7(2)(f))", "Without prejudice — legal advice", "In confidence"), treat every substantive sentence in that section as a strong candidate for detection under the cited ground. Flag each sentence with the appropriate type; do NOT try to summarise the section into one detection.
- Section markers and the type/ground to use:
  - "free and frank", "candid", "candour", "candidly" applied to *advice or opinion content* → type "free-frank", ground s7(2)(f)(i). This is the default when a section is simply labelled "(free and frank)" without further specialisation.
  - Within a "(free and frank)" section, if a specific sentence instead identifies a complainant, a witness, or a subject of a grievance alongside personal details → type "harassment-risk", ground s7(2)(f)(ii). Triggers: complainant name + complaint detail, witness name + characterisation, grievance subject + personal attribute. The s7(2)(f)(ii) ground applies when the protective need is individual-harm avoidance rather than advice-candour preservation.
  - "without prejudice", "privileged", "legal advice", "counsel's view", "solicitor-client" → type "legal-privilege", ground s7(2)(g)
  - "in confidence", "confidential", "not for circulation" → scrutinise every sentence; use the type that best fits the specific sentence content
- **Commercial triggers.** "commercially sensitive", "commercial in confidence", "trade secret", "proprietary", "tender evaluation matrix", "tender evaluation criteria", "bid price", "competitor pricing", "provided on condition of confidentiality", "confidential to [third party]" → type `commercial`, ground s7(2)(b)(i) for trade secrets (formulae, processes, know-how), s7(2)(b)(ii) for third-party competitive prejudice (pricing, bid structure, financial information). When the content describes the council's own commercial activity (investment strategy, pricing council services, joint venture terms) rather than a third party's, use type `council-commercial`, ground s7(2)(h).
- **Health-safety public-measure triggers.** "vulnerability assessment", "security protocol", "emergency response plan", "pandemic response", "critical infrastructure", "backup procedure", "fallback threshold", "contamination response", "building safety report" → type `health-safety`, ground s7(2)(d). Distinguish from `safety-concern` (s6(d)), which protects an individual — health-safety protects the protective measures themselves.
- **Tikanga-cultural triggers (RMA and resource-consent contexts).** "tapu", "urupā", "wāhi tapu", "kōiwi tangata" → type `cultural-sensitivity`, ground s7(2)(ba). These are strong literal triggers; avoid over-extending to procedural phrases like "mana whenua consultation" or "cultural impact assessment" (which are document-type references rather than sensitive content), where the AI should rely on semantic judgement rather than structural match.
- Investigation / disciplinary / grievance documents (inferred from classification context or in-body signals): treat witness names, witness descriptions, and positional identifiers as candidates for "harassment-risk" (s7(2)(f)(ii)) even without other identifying PII.
- A label does not "immunise" its value. When you see `<label>: <value>` or a two-cell row `[label | value]`, flag the value using the type implied by the label; skip the label itself. This applies to "Date of birth", "Phone", "Email", "Address", "IRD", "NHI", "NZ Passport", "Driver Licence", "Employee number", and any similar field name.
```

**Expected fix traceability for the Sarah Liang and Ben Mahuika miss class:** Example 15 + the reworded line 260 carve-out address this directly. Spike evidence: o4-mini flagged Dr Sarah Liang 2/3 runs purely because it was less rigid about the carve-out wording; the reword makes the same behaviour explicit for gpt-4o.

### 4. New or modified API routes

None.

### 5. Pipeline changes

Prompt-only. No pipeline flow changes. The cache-friendly restructure is purely a reorder inside `buildSystemPrompt()`.

### 6. Coordinate system

N/A.

### 7. Test strategy

**Unit:** `lib/pipeline/__tests__/ai-detect.test.ts` — one new mocked-AI test per added example type, asserting the pipeline surfaces and persists the detection correctly. Plus one test asserting the system prompt structure (classification block appears after the stable heuristics block) for the cache-friendly change.

**Integration:** Run the Phase 2 benchmark on the bench fixtures (B1, B2, A, B3). Compare before/after recall on governance-pathway types, third-party-professional flags, and personal-pathway labelled-field types.

**E2E:** No new specs.

**Manual:** Side-by-side diff of detections on B1 before and after. Confirm Dr Sarah Liang and Ben Mahuika are now flagged as dedicated `personal-name` detections. Review every added / removed detection for correctness.

### 8. Rollback plan

Revert the prompt commit. Zero-risk: the prompt change is idempotent and backward-compatible.

### 9. Effort estimate

**4–6 engineer-days.**

### 10. Dependencies

- **Blocks:** None operationally. Phase 4 and Phase 5 are complementary, not blocked.
- **Blocked by:** Phase 2 (need the bench to measure the before/after).

### 11. Prompt caching

Azure OpenAI supports prompt caching for GPT-4o-series models on stable system-prompt prefixes ≥1024 tokens. The Phase 3 rework brings the system prompt to ~4,500 tokens including the 18 worked examples plus the expanded structural heuristics — well above the threshold. Pre-fix, `buildClassificationContext()` prepends per-document content at the very start of the system message, invalidating the cache on every call. The cache-friendly restructure (classification block moved to the end of the system message) means the long stable prefix hits the cache on every subsequent call inside the 5-minute TTL.

**Token-cost impact (to verify against Azure's current pricing docs):**
- Cached input tokens bill at ~50% of normal input rate on GPT-4o-series (subject to verification — Azure pricing varies by model tier and region).
- For a 3-batch document, the second and third batches land fully cached.
- Estimated per-document detection cost drops ~30–40%, fully offsetting the ~900-token addition from the ten new examples + expanded structural heuristics (commercial, health-safety, tikanga-cultural triggers added in v3.1).

Cache key is the exact prefix string. With the restructured `buildSystemPrompt()`, the prefix is stable across all documents processed within the TTL window.

---

## Phase 4 — Entity propagation pass

**Status (2026-04-23):** queued, not started. Blocked by Phase 3 PR B (expected-after-Phase-3 bench numbers inform whether Phase 4 still needs to lift bare-surname recall or whether prompt rework has already closed it on B3).

### 1. Scope and success criteria

Deterministic post-AI pass that takes each AI-detected personal-name and propagates it across the whole document, catching cross-batch occurrences that the AI missed due to the 3-page batch boundary (Hypothesis C) on documents that exceed `AI_DETECT_SINGLE_BATCH_MAX_PAGES`.

**Premise (added per spike outcome D):** This phase's premise — that 3-page batch boundaries cause cross-batch entity continuity failures — was **NOT validated** by the 2026-04-20 spike because B1 extracted to a single canonical page (5,694 chars) and all 6 runs were single-batch. Phase 4 is therefore speculative and **contingent on Phase 1.5's extraction investigation** concluding either:

- (a) that multi-page DOCX extraction routinely produces ≥7-page canonical forms elsewhere in the corpus, confirming Hypothesis C is real at corpus scale; or
- (b) that we can construct a fixture (the Phase 2 `B3_Long_Investigation.pdf`) whose canonical form batches, validating Hypothesis C in a controlled setting.

If Phase 1.5 concludes extraction *universally* collapses short-to-medium DOCX into single pages (unlikely but possible if the pipeline has a silent coalescing step), Phase 4 is **demoted to a follow-up PR** against a future multi-document or programmatically-authored long fixture. The remaining phases (5, 6) do not depend on Phase 4's outcome.

**Success:** on B3 (the ≥7-page cross-batch fixture authored in Phase 2), all in-prose occurrences of names detected at least once anywhere in the document are flagged. Recall on `personal-name` type improves by ≥20 percentage points without precision drop of more than 3 percentage points. B1 remains stable as a regression control (single-batch; entity propagation must not regress it).

### 2. Schema changes

None to Prisma. A new value in `Detection.source`: `"entity-propagation"`.

### 3. File-level change list

**New files:**
- `lib/pipeline/entity-propagation.ts` — ~200 lines. Exports `propagateNameDetections(pages, aiDetections, patternDetections): PropagatedDetection[]`. Pure function, no I/O.
- `lib/pipeline/__tests__/entity-propagation.test.ts` — unit tests covering stopword safeguards, title-prefix variants, bare-surname rejection, multi-page propagation.
- `lib/pipeline/stopwords.ts` — small curated stopword list (~100 entries).

**Modified files:**
- `lib/pipeline/process.ts:550–551` — after `detectWithAI` returns, call `propagateNameDetections(pages, aiDetections, patternMatches)` and merge results into the candidate-detection pool before bbox enrichment (line 664). Estimated insertion: 5 lines.

### 4. New or modified API routes

None.

### 5. Pipeline changes

Insert one step between AI detection and bbox enrichment:

```
fetch doc → … → pattern/custom/AI detection →
+ entity-propagation pass (personal-name propagation only) →
bbox enrich → dedup → store detections → …
```

The propagated detections carry `source="entity-propagation"`, confidence 85, and go through the same `calculateBBoxAll` (bbox) and `(page, type, text, posY_rounded)` dedup as every other source.

**Algorithm sketch:**

```
for each aiDetection where type == "personal-name":
  parse text → { title?, first?, middles?, surname }
  generate variants:
    - exact re-occurrences of the full detected text
    - "Title + surname" (e.g. "Ms Ferguson") ONLY if title is in the known-titles set
    - "First + surname" (e.g. "Melissa Ferguson")
    - surname alone ONLY if ALL of:
        - surname length ≥ 5 characters
        - preceded by a known title OR a known first-name we've seen for this surname elsewhere in the doc
        - a capitalised proper-noun neighbour exists within ±20 characters (confirms proper-noun context, not a stopword collision)
  for each variant:
    scan each page.text for non-overlapping case-sensitive-first-letter matches
    reject if the candidate is in STOPWORDS
    reject if the variant overlaps a span already claimed by the source AI detection
    emit { text: <variant>, type: "personal-name", page, source: "entity-propagation", confidence: 85 }
```

### 6. Coordinate system

N/A beyond the existing percentage-of-canonical-PDF convention.

### 7. Test strategy

**Unit:**
- Stopword rejection: "Mr Council" does not propagate.
- Title-prefix variants: from "Melissa Ferguson" seed, propagate "Ms Ferguson", "Dr Ferguson" if present, "Melissa Ferguson" exact re-occurrences, "Ferguson" bare ONLY when preceded by a known title or known first-name.
- Cross-page propagation: seed on page 1, hits on page 3 produce detections with `page=3`.
- 5-character surname floor: "Smith" (5 chars) propagates ONLY when anchor conditions met; "Lee" (3 chars) never propagates unanchored.
- Proper-noun-neighbour constraint: "Smith" in "John Smith said..." propagates; "Smith" in "a smith on the high street" does not.

**Integration:** Benchmark B3 before/after, plus B1 as a regression control.

**E2E:** One new Playwright spec uploading B3, asserting detection count ≥ baseline + 15.

**Manual:** Review every new detection produced on 3 real-world fixtures for false positives. If FP rate >5%, tighten safeguards further.

### 8. Rollback plan

Feature-flag via a new `SystemSetting` key `ENTITY_PROPAGATION_ENABLED` (default true).

### 9. Effort estimate

**5–7 engineer-days** (if the Phase 1.5 outcome supports proceeding; otherwise 0 days in this plan and a separate follow-up PR).

### 10. Dependencies

- **Blocks:** None downstream.
- **Blocked by:** **Phase 1.5** (premise validation) and Phase 2 (benchmark B3 fixture).

---

## Phase 5 — Label-adjacent detection

**Status (2026-04-23):** queued, not started. Orthogonal to Phases 3 and 4; could run in parallel with them once bench capacity allows.

### 1. Scope and success criteria

Add a third detection source (alongside `pattern`, `ai`, `custom` rules) that scans extracted page text for `<label>: <value>` patterns and adjacent-cell label/value pairs, and emits detections keyed on the label → type mapping. Catches labelled DOBs, labelled driver licences, labelled employee numbers, labelled GP names, etc. even when the AI misses them.

Implementation is **regex-over-raw-text** (not DI-structural-table-cell traversal). Trades some precision on complex multi-column tables for zero additional Azure DI cost (the current `prebuilt-read` tier is retained; a `prebuilt-layout` upgrade is ~5× the per-page cost and is deferred to a possible follow-up if Phase 5 recall is sub-target).

**Success:** on B1, all labelled table values are detected with type agreement to the label's implied type. No false positives on labelled *titles* (e.g. "Position: Senior Advisor" should not flag "Senior Advisor" as personal-name).

### 2. Schema changes

None to Prisma. A new value in `Detection.source`: `"label-adjacent"`.

### 3. File-level change list

**New files:**
- `lib/pipeline/label-adjacent-detect.ts` — ~250 lines. Exports `detectLabelAdjacent(pages, enabledTypes): LabelAdjacentMatch[]`.
- `lib/pipeline/label-dictionary.ts` — the label → detection-type mapping. ~30 entries:
  - "date of birth" | "dob" → personal-name
  - "phone" | "telephone" | "mobile" → phone
  - "email" → email-addr
  - "address" | "residential address" | "home address" → address
  - "ird" | "tax number" → ird
  - "nhi" | "national health" → nhi
  - "passport" | "nz passport" → nz-passport
  - "driver licence" | "licence number" | "dl" → driver-licence
  - "employee number" | "staff id" | "badge number" → confidential
  - "gp" | "general practitioner" → personal-name, BUT only when followed by `:`, `,`, or a capitalised proper-noun token within ±5 characters. Example match: `GP: Dr Sarah Liang` → flag "Dr Sarah Liang"; Example non-match: `at grid reference GP-12 on the site plan` → skip.
  - ICD-10 prefix heuristic → confidential.
- `lib/pipeline/__tests__/label-adjacent-detect.test.ts` — unit tests with synthesised page-text inputs.

**Modified files:**
- `lib/pipeline/process.ts` — call `detectLabelAdjacent(extraction.pages, enabledTypes)` alongside `detectPatterns` (around line 521), merge results into the candidate pool.
- `lib/data/settings.ts` — new `DetectionToggle` entries: "Employee Numbers", "GP / Practitioner Names", "Diagnostic Codes".

### 4. New or modified API routes

None.

### 5. Pipeline changes

Parallel to patterns, running on the same extracted page text. Output merges through the same bbox enrichment + dedup.

### 6. Coordinate system

N/A beyond existing convention.

### 7. Test strategy

**Unit:** 10+ cases covering each dictionary entry. Include the "GP-12 grid reference" false-positive scenario and the tightened GP-label match specifically.

**Integration:** Benchmark run on B1 — labelled DOBs, licence, employee numbers should all appear with `source="label-adjacent"`.

**Manual:** Check a non-LGOIMA-style document doesn't get spurious detections. Check complex multi-column-table documents to understand precision floor.

### 8. Rollback plan

Feature flag `LABEL_ADJACENT_DETECTION_ENABLED` (default true).

### 9. Effort estimate

**3–4 engineer-days.** Dominant cost is dictionary curation and false-positive tuning.

### 10. Dependencies

- **Blocks:** None.
- **Blocked by:** Phase 2 (bench needed).

---

## Phase 6 — Structured outputs migration

**Status (2026-04-23):** queued, not started. Hardening track; can slip without blocking any other phase.

### 1. Scope and success criteria

Migrate AI detection output from `response_format: { type: "json_object" }` to `response_format: { type: "json_schema" }` with `strict: true`. Removes most of `validateDetection()`'s defensive coercion (`lib/pipeline/ai-detect.ts:351–379`) and eliminates the "model invents a novel type or ground" failure mode.

**Pre-condition:** Hypothesis B verified.

**Success:** `validateDetection()` shrinks to ~10 lines of pass-through; detection `type` is guaranteed to be in the enum; detection `suggestedGround` is guaranteed to be in the 27-entry enum generated from `lib/lgoima-grounds.ts`; `normaliseGroundToId` continues to map the validated `s7(2)(a)` format into the stored `s7_2a` format; the model cannot produce out-of-range confidences; zero regression on recall against the Phase 2 benchmark.

### 2. Schema changes

None to Prisma.

### 3. File-level change list

**New files:**
- `lib/pipeline/ai-detect-schema.ts` — the JSON Schema definition. ~70 lines. Key structural elements:
  - `type`: enum of the ALL_AI_TYPES array.
  - `suggestedGround`: enum of the 27 `s7(2)(a)`-style strings, built from `lgoimaGrounds` at module load.
  - `confidence`: `{ type: "integer", minimum: 0, maximum: 100 }`.
  - `additionalProperties: false` at object level (mandatory for strict mode).

**Modified files:**
- `lib/pipeline/ai-detect.ts:489–499` — replace `response_format: { type: "json_object" }` with `response_format: { type: "json_schema", json_schema: { ... } }`.
- `lib/pipeline/ai-detect.ts:351–379` — gut `validateDetection()` to thin mapping; retain only the `normaliseGroundToId` call and type-existence fallback.

### 4. New or modified API routes

None.

### 5. Pipeline changes

None to flow.

### 6. Coordinate system

N/A.

### 7. Test strategy

**Unit:** Mock OpenAI client to return a strict-schema response; assert mapping is correct. One case verifying a simulated invalid `s7(2)(z)`-style ground is rejected and our code handles gracefully.

**Integration:** Benchmark run on B1, B2, A, B3 — precision/recall must not drop.

**Manual:** Deliberately corrupt the mocked model response to invalid-enum-type. Strict mode should reject before our code sees it.

### 8. Rollback plan

Flip one line back to `{ type: "json_object" }`. `validateDetection()` is kept alive.

### 9. Effort estimate

**3–5 engineer-days.**

### 10. Dependencies

- **Blocks:** None.
- **Blocked by:** Hypothesis B verification. Phase 3 (new examples shouldn't miss the strict-schema migration window).

---

## Decisions with recommendations

### (a) Entity propagation scope — names only, or all AI-detected types?

**Recommend: names only, for v1.** Non-name types are sentence-level semantic detections; propagating a free-frank sentence verbatim across the document makes no sense. For v2, consider *identifier* propagation (ird, email-addr, phone, bank-account exact-match) as a follow-up PR.

### (b) Model choice — resolved

**Decision: stay on gpt-4o.** Per the 2026-04-20 spike at `docs/spike-model-comparison-2026-04-20/comparison.md`. Reconsider when GPT-5 or Claude Sonnet 4.5 becomes available on Azure australiaeast, or if procurement allows Anthropic API access. o4-mini ruled out regardless for user-facing paths (see (h)).

### (c) Structured outputs adoption

**Recommend: defer to Phase 6.** Coupling it to Phase 3 would confound the benchmark.

### (d) Ground-truth authoring workflow

**Recommend: hybrid — Eugene authors B1 fully; Claude drafts B2, A, B3, and C1; Eugene reviews the drafts.** B1 is the incident anchor; its ground truth must be Eugene's judgement outright. Authoring lives in Phase 2 (not Phase 0, which has collapsed). Expected cost: B1 ~1 day of Eugene time; each drafted fixture ~2 hours of Eugene review against ~0.5 day of Claude drafting.

Alternatives considered: full Eugene authoring on every fixture (more rigorous, adds ~2 days) and full Claude drafting with lighter-touch review (faster but risks Claude-measuring-Claude tautology).

### (e) Bakeoff budget — superseded

The 2026-04-20 spike consumed ~$3 NZD of Azure OpenAI spend. No further bakeoff budget needed until a reconsideration trigger fires (see (b)).

### (f) Toggle defaults

**Recommend these flips:**
- `nz-passport`: false → true.
- `vehicle-reg`: false → true.
- `driver-licence`: already true.

**Keep as-is:** every other type at default true.

### (g) Phase ordering

**Recommend the ordering above (0, 1, 1.5, 2, 3, 4, 5, 6)** with:
- Phase 1 runs parallel to Phase 1.5 — both independent and ship in parallel.
- Phase 4 is blocked by Phase 1.5 and Phase 2.
- Phases 5 and 6 have no mutual dependencies after Phase 2.

### (h) Latency as a selection criterion — new

**Reasoning models (o1, o3, o4, o-mini variants) are ruled out for synchronous user-facing detection regardless of quality wins.** The 2026-04-20 spike showed `o4-mini` at 61s median (range 52.1–70.1s) vs `gpt-4o`'s 11s median (range 8.5–14.6s) on a single B1 batch — ~5.4× slower. Extrapolated to a 15-page document with Phase-1's `AI_DETECT_SINGLE_BATCH_MAX_PAGES=6` guard (so 5 batches of 3 pages): gpt-4o ≈ 55s, o4-mini ≈ 5 min per document. This is prohibitive for user-facing detection latency. Any future model-choice evaluation must weigh latency alongside recall, not recall alone. Reasoning models may still warrant evaluation for offline / batch-reprocessing paths where 5-minute-per-doc latency is acceptable, but are not candidates for the interactive reviewer pipeline. Reference: `docs/spike-model-comparison-2026-04-20/comparison.md`.

---

## Risks

### Architectural

- **Phase 4 entity propagation false positives.** Safeguards (stopword list, title-or-first-name anchor, 5-character surname minimum, proper-noun-neighbour constraint) mitigate but don't eliminate. Mitigate by tightening the anchor rules rather than capping occurrences — capping would produce false negatives, not fewer false positives.
- **Strict schema rejection rate (Phase 6).** If the model deviates on edge cases, API returns 400 and the batch produces zero detections. Mitigate with graceful-degradation: on strict-schema 400, fall back to `json_object` for that batch and log the schema deviation.
- **Prompt bloat.** Phase 3 adds 10 examples + an expanded structural-heuristics block (commercial, health-safety, tikanga-cultural triggers in v3.1 alongside the earlier free-and-frank / legal-privilege / labelled-field groups) + the reworded council-official carve-out. Approximate token cost increase per call: 800–1,000 tokens. Negligible at current GPT-4o pricing. Lost-in-the-middle risk: placed structural-heuristics immediately before worked-examples to keep related content contiguous. The Phase 3 §11 cache-friendly restructure offsets token cost.
- **Phase 4 premise unvalidated.** The 2026-04-20 spike did not exercise cross-batch behaviour because B1 extracts to a single page. If Phase 1.5 finds the pipeline universally collapses short-to-medium DOCX, Phase 4's premise (3-page batches cause propagation failures) may be moot for realistic demo documents and Phase 4 should be deferred. Treat Phase 4 as contingent.

### Dependency

- **Reconsideration triggers for model choice** (Decision (b)). GPT-5 on Azure australiaeast availability is an external dependency we don't control; similarly Anthropic procurement.
- **Strict structured outputs** (Hypothesis B). Requires verification.
- **Regex-over-raw-text label detection precision.** Phase 5 depends on DI preserving `<label>: <value>` line structure on non-trivial tables. Phase 2 benchmark quantifies this; if precision floors below acceptable, the DI-tier upgrade to `prebuilt-layout` becomes a scoped follow-up (operational cost impact ~5× current DI bill).

### Migration / operational

- **Toggle defaults affect new instances only.** Existing instances with `system_settings` rows already committed keep their stored values.
- **Benchmark CI cost.** 20 PRs/month ≈ $10 NZD/month. Acceptable. Phase 3's cache-friendly restructure reduces this further.
- **CI/CD migration gap.** Deploy pipeline does not run `npx prisma migrate deploy`. None of Phases 0–6 introduces a migration, so the gap does not bite this work.
- **Latency deltas on reasoning models** (Decision (h)). If a future reconsideration trigger recommends a reasoning-model option, deploy-path latency review must precede adoption.

---

## Rollout and reprocess

This instance (`app-veil-prototype`, PNCC demo) currently holds test and dummy data. Reviewer decisions on existing detections are not load-bearing for any real LGOIMA release. This means each phase's reprocess decision can be taken on technical merit without the governance-gate constraints a production tenant would require (per `docs/viewer-rework-plan-2026-04.md` §Risks). For any future production instance, the governance-gate constraints apply and this section must be revisited.

**Per-phase reprocess recommendations for the demo instance:**

- **Phase 1** — landline regex + toggle defaults + env-var split + single-batch guard. Recommend reprocessing all existing documents post-merge to pick up parenthesised-landline matches and (if `nz-passport` default flip takes effect on this instance's stored `system_settings`) any previously-suppressed passport detections.
- **Phase 1.5** — investigation only. No reprocess.
- **Phase 2** — benchmark harness. No reprocess.
- **Phase 3** — prompt rework. **Recommend full reprocess** post-merge. New examples and structural heuristics materially change AI output; the third-party-professional reword alone changes which names are flagged.
- **Phase 4** — entity propagation (contingent on Phase 1.5). If ships: **recommend full reprocess**.
- **Phase 5** — label-adjacent detection. **Recommend full reprocess**.
- **Phase 6** — structured outputs migration. No reprocess needed.

**Operational notes:**
- `scripts/reprocess-all-documents.ts` does not exist yet; spec it alongside Phase 1 as a trivial utility. Accepts `--dry-run`, `--max-concurrent` (default 2), `--phase` label.
- Reprocessing changes `Detection` IDs. Acceptable for demo; not for production.
- Reprocessing does not change `Document.canonicalPdfPath` or `canonicalPdfSha256`.
- Reprocessing does not change `DocumentPage` rows if the canonical PDF sha256 hasn't changed.

---

## Open questions for reviewer

1. **Procurement / sovereignty.** OK to swap model dependency from Azure OpenAI to Anthropic API if a future reconsideration trigger (Decision (b)) recommends it? Azure OpenAI in australiaeast is sovereignty-compliant; Anthropic API via AWS us-east is not necessarily.

2. **Hotfix urgency for Hypothesis A.** Landline regex fix is confirmed and has 11 passing regression test cases. Ship as a same-day hotfix (Phase 1 with only the regex piece), or wait for the full Phase 1 bundle (2–3 days)?

3. **Entity propagation scope (Phase 4).** Names only (personal-name type), or extend to identifier types (phone, email, IRD, bank-account) where exact-match propagation has no FP risk? Recommendation: names-only for v1, identifiers in a v2 follow-up. (Also contingent on Phase 1.5 outcome — if Phase 4 demotes to follow-up, this question follows.)

4. **Structured outputs track.** Part of this detection-coverage work (Phase 6), or separate hardening track? Recommendation: keep as Phase 6 for co-location with the benchmark.

5. **DI-tier upgrade as a Phase 5 follow-up.** If Phase 5's regex-over-raw-text recall lift on labelled-field targets is <N percentage points (N to set in Phase 2 baselining), is a DI-tier upgrade to `prebuilt-layout` in scope for a subsequent PR (operational cost impact ~5× current DI bill)?

6. **Phase 1.5 outcome impact (new).** If Phase 1.5 concludes extraction universally collapses short-to-medium DOCX to single pages, should Phase 4 be cut entirely from this plan and filed as a separate follow-up against a future programmatically-authored long-document fixture? Or kept in-plan on the basis that long docs will eventually enter the corpus?

7. **Sarah Mitchell carve-out design (new).** Spike showed Sarah Mitchell (investigator in the grievance context) is missed by both gpt-4o and o4-mini. The Phase 3 reworded carve-out must preserve "council's own staff" protection without excluding investigator-in-grievance-context from `harassment-risk`. How tight should the distinguishing wording be — explicit enumeration of roles (investigator, HR manager in grievance) vs context-based (any staff name appearing alongside grievance detail)?

---

## Implementation log

### Phase 0 — 2026-04-20

- Model-choice spike executed against `o4-mini` on `eastus` vs `gpt-4o` on `australiaeast`. 3 runs per condition. Full results at `docs/spike-model-comparison-2026-04-20/`.
- B1 DI-extracted to a single 1-page canonical form (5,694 chars) despite the source DOCX visually rendering to 4 pages — flagged for Phase 1.5 investigation.
- "my honest read" target in the spike runner's checklist was fictional (not present in the extracted text). Noted as an authoring-error caveat; future checklists should be grep-verified against the extracted source before scoring.
- Decision recorded: stay on gpt-4o. Reconsideration triggers captured in Decision (b).

### Phase 1 (stub)

- *(Phase 1 not yet started.)*

### Phase 1.5 — 2026-04-20

- Investigation complete. Full write-up at `docs/phase-1-5-extraction-findings.md`.
- **Root cause of the spike's 1-page B1 result: spike-script artefact, not production pipeline behaviour.** The spike runner calls `extractText(buf, "DOCX")` which routes to `lib/pipeline/extract.ts:144–156`'s `extractFromDocx` — mammoth-based, hardcoded to return a single page. Production instead calls `buildCanonicalPdf` first and then `extractText(canonicalBuffer, "PDF")`, routing through DI which respects page breaks. cr17 production logs confirm B1 extracts to 4 canonical pages, 5,596 chars in production.
- **javaldx warning is cosmetic.** Installing `default-jre` or `default-jre-headless` does not suppress it (LibreOffice-nogui's `javaldx` helper expects Java in a location not matched by Debian's JRE packaging). Conversion exits 0 and produces correct multi-page output regardless.
- **Other DOCX fixtures tested** (`04_main_case_file_long`, `05_internal_briefing_and_recommendation`, `06_supporting_statements_and_appendices`) all produce 8-page canonical PDFs in the Docker environment. B1 is a short outlier, not evidence of a pipeline-level page collapse.
- **Phase 4 disposition: proceed as drafted.** Cross-batch premise is valid for DOCX >6 canonical pages. B1 is too short to test it; `B3_Long_Investigation.pdf` (authored in Phase 2) is the correct test fixture — already specified in the plan.
- **No Dockerfile change applied.** No cr18 deploy.
- **Follow-up items surfaced** (out of Phase 1.5 scope):
  - Intermittent "Canonical PDF build failed" errors observed on `app-veil-prototype` (three on 2026-04-20). Likely App Service memory pressure / concurrent-conversion profile locking. Track as a separate ops ticket.
  - Future spike/bench harnesses testing the production DOCX flow must go through `buildCanonicalPdf` first, not call `extractText` directly with a DOCX buffer.

---

## Revision log

### v3 → v3.1 (2026-04-20)

**Three targeted amendments from the follow-up peer review** — closing the contextual-AI-matching coverage gap flagged as HR-investigation-narrow in v3:

- **Amendment 1 — three new worked examples in Phase 3 §3:**
  - Example 16 — commercial / third-party competitive prejudice (type `commercial`, ground s7(2)(b)(ii)).
  - Example 17 — public health-safety protective measure (type `health-safety`, ground s7(2)(d)).
  - Example 18 — obligation of confidence / whistleblower (type `confidential`, ground s7(2)(c)(i)).
- **Amendment 2 — structural-heuristics block expanded** with three new trigger groups after the existing `free and frank` / `without prejudice` / `in confidence` groups: commercial triggers (trade-secret and tender-pricing vocabulary), health-safety public-measure triggers (emergency-response / infrastructure-vulnerability vocabulary), and tikanga-cultural triggers (explicit literal terms only — `tapu`, `urupā`, `wāhi tapu`, `kōiwi tangata`). Mana-whenua-consultation and cultural-impact-assessment phrases deliberately excluded from the structural triggers to avoid over-firing on procedural document-type references; the AI should rely on semantic judgement for those.
- **Amendment 3 — new C1 commercial-pathway fixture** added to Phase 2 benchmark corpus (`test-fixtures/bench/C1_Tender_Evaluation_Commercial.docx` + `.expected.json`). Validates commercial, council-commercial, negotiation, and cultural-sensitivity recall against a non-HR document shape. Ground-truth authoring joins the Claude-drafts / Eugene-reviews hybrid.

**Cosmetic corrections:**
- Phase 3 §1 scope sentence — dropped the "layer five additive changes" count language (the change list was inconsistent with any single number) in favour of enumerated content descriptors.
- Example 11 (witness identity in grievance context) — subject renamed from "Ms Ferguson" to "Ms Patel" so the example doesn't imply the complainant is the subject of witness concerns (B1's Ferguson is the complainant, not the grievance target).

**Effort delta (v3 → v3.1):**
- Phase 3: 3–5 → **4–6 engineer-days** (three new worked examples + expanded structural heuristics).
- Phase 2: 5–8 → **6–9 engineer-days** (C1 fixture authoring + ground truth).
- Other phases unchanged.
- **v3 total: 22–33 → v3.1 total: 24–35 engineer-days.**

**No new open questions.** Existing v3 open questions stand.

### v2 → v3 (2026-04-20)

**Mandatory changes applied from the 2026-04-20 model-choice spike:**
- **Spike change 1** — Phase 0 collapsed to "Model choice (spike-resolved)". Effort 0.5 day. Decision recorded: stay on gpt-4o. Reconsideration triggers captured in Decision (b). Raw artefacts at `docs/spike-model-comparison-2026-04-20/`.
- **Spike change 2** — New Phase 1.5 "Extraction-quirk investigation" added before Phase 4. B1's single-page extraction unresolved. Blocks Phase 4.
- **Spike change 3** — Phase 3's third-party-professional reword (formerly Tier 3 item 12, optional) promoted to mandatory scope. New Example 15 added. Line 260 carve-out rewording specified in detail.
- **Spike change 4** — Phase 4 given explicit "Premise" paragraph noting the speculative status pending Phase 1.5. Phase 4 success criterion moved from B1 to B3 (multi-batch fixture).
- **Spike change 5** — Phase 2 benchmark fixture list expanded to name a cross-batch fixture (`B3_Long_Investigation.pdf`, authored in Phase 2). Ground-truth authoring also moved from Phase 0 to Phase 2.
- **Spike change 6** — New Decision (h) "Latency as selection criterion" with o4-mini's 5.4× slowdown data.
- **Spike change 7** — Removed any reference to the fictional "my honest read" target from plan material. Implementation log notes the authoring caveat.

**Tier 1 (peer review — all resolved in v2, reconfirmed in v3):**
- Item 1 — Single-batch guard: ship both; Phase 4 test on B3 (now also the Phase 2 cross-batch benchmark anchor).
- Item 2 — DI tier for Phase 5: regex-over-raw-text (option b).
- Item 3 — Phase 2 timing: 5–15 minutes, `--quick-mode` for 5-minute runs.
- Item 4 — Ground-truth authoring: hybrid (Eugene authors B1; Claude drafts B2, A, B3; Eugene reviews). Open Question 2 retired.
- Item 5 — B1 fixture: already present locally at `test-fixtures/dummy-lgoima-pack/B1_HR_Investigation_Report_Kellogg_Ferguson.docx`. Allowlist via `.gitignore`. Open Question 8 retired.

**Tier 2 (peer review — all resolved in v2, reconfirmed in v3):**
- Item 6 — Example 11 header aligned to `harassment-risk`.
- Item 7 — Structural heuristic split: (f)(i) vs (f)(ii).
- Item 8 — Phase 4 mitigation: anchor-tightening, not occurrence-cap.
- Item 9 — Phase 6 schema: option (a), enum of 27 ground strings.
- Item 10 — "GP" label: tightened to require `:` / `,` / capitalised-value context.
- Item 11 — A1 respec'd as governance-pathway fixture. Per spike change 5, authoring moves from Phase 0 to Phase 2; filename simplified to `A_Council_Memo_Candid_Advice.pdf`.

**Tier 3 (peer review):**
- Item 12 — Third-party professional detection: **PROMOTED to mandatory** per spike observation B (see spike change 3 above).
- Item 13 — Prompt caching: folded into Phase 3 §11. Cache-friendly restructure specified.
- Item 14 — Rollout and reprocess: top-level section preserved.
- Item 15 — Dr Sarah Liang traceability: confirmed via spike; Phase 3's Example 15 + line 260 reword target this directly.
- Item 16 — Phase 1 effort raised to 2–3 days.

**New open questions added:**
- Q6 — Phase 1.5 outcome impact on Phase 4's scope.
- Q7 — Sarah Mitchell carve-out design (how tight should the distinguishing wording be between council's own staff carve-out and investigator-in-grievance-context flagging).

**Retired open questions (v1 numbering):**
- Q2 (Phase 0 budget) — retired; spike executed within an acceptable spend.
- Q6 (model-swap impact on existing detections) — retired; no model swap.
- Q8 (B1 fixture provenance) — retired; fixture present locally, allowlist specified.

**Net effort delta (v2 → v3):**
- Phase 0: 3–5 days → 0.5 day (spike-resolved).
- Phase 1.5: +0.5–1 day (new).
- Phase 2: 4–6 days → 5–8 days (ground-truth authoring and new fixtures absorbed from Phase 0).
- Other phases unchanged.
- v2 total: 23–35 days → **v3 total: 22–33 days**.

**Net scope delta:**
- +1 new phase (1.5, extraction investigation).
- +1 new mandatory scope in Phase 3 (third-party-professional reword, promoted from optional).
- +1 new decision (h, latency criterion).
- +1 new top-level spike-outcome sub-section in the executive summary.
- −1 Phase 0 bakeoff (subsumed by the spike).

### v1 → v2 (2026-04-20)

*See v2 revision log above for the detailed peer-review resolutions; all Tier 1 and Tier 2 items resolved, most Tier 3 items folded in. Key v1→v2 deltas: 24–37 → 23–35 days (Phase 1 +1, Phase 5 −2 to −3), +1 fixture (B3), +1 worked example (Example 15), +1 prompt-restructure, +1 top-level section (Rollout and reprocess), −1 DI-tier upgrade commitment.*

---

## Final deliverable location

This plan lives at `docs/detection-coverage-plan-2026-04.md` in the repo. Not committed to git as of this revision.
