# Session handoff — 2026-04-21 (end of day)

Purpose: capture state sufficient to continue the detection-coverage and viewer-rework work streams in a fresh conversation without losing context. Supersedes `docs/session-handoff-2026-04-20.md` (renamed from; same file, carried forward with 2026-04-21 deltas).

---

## Current state

### Deployed (veil.datasing.nz)
- **cr17** live. Phase 1 of detection-coverage complete.
- Phase 1.75 fix merged 2026-04-21 and deployed. Long-narrative AI detections (text >80 chars) now survive to storage and the review UI.
- All deploys functionally verified on the live instance.

### Git state
- `main` contains everything from 2026-04-20 PLUS 2026-04-21's work: PRs #15, #16, #18, #21, #22.
- PRs still OPEN on `main`: **#23** (Phase 2 tranche 3 CI workflow — awaiting GitHub secrets before merge).
- GitHub issues open: **#20** (Tier 2 `TEXT_SEARCH_MAX_LENGTH` follow-up — unscheduled; bug / pipeline / priority/medium).
- GitHub issues closed on 2026-04-21: **#17** (B3 fixture — closed by PR #22's `Closes #17` footer).
- All merged branches deleted post-merge.
- **No git tags** have been created (`deploy-cr15`, `deploy-cr16`, `deploy-cr17`, plus a cr-for-Phase-1.75 when cut, would be useful archaeology; low priority).

### Working tree
- Clean at time of handoff (nothing uncommitted that isn't captured here).

---

## What shipped today

### 2026-04-21 — Phase 2 bench harness and the AI-detection-stripping fix

- **Phase 2 tranche 1 merged** — bench infrastructure (PR #15). Scoring library (`lib/bench/scoring.ts`), pathway map (`lib/bench/pathways.ts`), reusable runner (`lib/bench/bench-runner.ts`), CLI entry (`scripts/bench/bench-detection.ts`). No live-pipeline invocation yet — tranche 2b adds that.
- **Phase 2 tranche 2a-i merged** — hand-authored `.expected.json` ground truth for B1/B2/A/C1 (PR #16). B1 authored by Eugene outright; B2/A/C1 drafted by Claude against local text-verify checks. A and C1 fixtures generated via `scripts/generate-bench-fixtures.ts` (byte-reproducible docx).
- **Phase 2 tranche 2b merged** — pipeline invoker + bench suite runner + first live 4-fixture baseline (PR #18). Baseline captured pre-fix at `docs/bench-baselines/baseline-2026-04-20/`: **suite F1 0.273** (B1 0.241, B2 0.588, A 0.095, C1 **0.000**). C1 stored 0/9 AI-produced per run — surfaced the Phase-1.75 bug.
- **Phase 1.75 AI-detection-stripping investigation + fix merged and deployed** (PR #21, merge commit `50cd6c6`). Root cause: `calculateBBoxAll` in `lib/pipeline/bbox.ts` returned empty array for text > 80 chars; caller in `process.ts` iterated zero times and silently dropped the detection before storage. Fix: explicit length guard in `process.ts` emits a `(0,0,0,0)` bbox placeholder so long-narrative detections survive. Integration-test invariant relaxed to scope phantom-drop to ≤80-char text only. ~15 LOC. Findings doc: `docs/phase-1-75-ai-detection-stripping-findings.md`.
  - **Post-fix 4-fixture baseline captured** at `docs/bench-baselines/baseline-2026-04-21-post-fix/`: C1 `0.000 → 0.452`, A `0.095 → 0.471`, governance pathway `0.044 → 0.317`, commercial pathway `0.000 → 0.538`. Clean test: C1 stored 9/9 produced per run post-fix.
  - Known limitation filed separately as issue **#20**: the Tier-2 text-search redaction cap (`TEXT_SEARCH_MAX_LENGTH = 80` in `redact-pdf.ts:360`) still skips long-text detections at redact time; detections surface in the review UI but don't auto-redact. Reviewer workaround is the manual-detection flow. Priority/medium.
- **Phase 2 tranche 2a-ii B3 fixture merged** (PR #22, GitHub issue #17 closed). `test-fixtures/bench/B3_Long_Investigation.pdf` — 10-page Awatere District Council inquiry-report fixture rendered directly via pdf-lib (not DOCX→PDF) for stable canonical page count. 42 expected detections. Exercises Phase 4 cross-batch entity propagation (4 of 5 named individuals have full / honorific / bare-surname variants across pages 2–9) plus Phase 3 Example 17 health-safety protective-measures coverage.
- **New 5-fixture baseline** captured at `docs/bench-baselines/baseline-2026-04-21-5fixtures/`. **Suite F1 0.481** (B1 0.254, B2 0.722, A 0.485, C1 0.370, B3 0.589). Per-pathway: personal 0.615, commercial 0.467, governance **0.282**, enforcement 0.182. Governance is the target for Phase 3.
- **GitHub issue #20 filed** — Tier-2 `TEXT_SEARCH_MAX_LENGTH` follow-up. Three possible fixes outlined (raise cap, chunk long text, fuzzy anchor); option 1 recommended as first try.

### cr15 — content-rebuild fix (pre-today merge, referenced for context)
- `lib/pipeline/rebuild-content.ts` Option E implementation + 12 unit tests.
- Fixed: manual-detection mutations were flattening DOCX table structure by re-running `buildContent()` (flat) on `Document.contentJson` via `rebuildContentJson`. Now refreshes segments in place, preserving type/rows/cells/etc. Safety-net fallback to flat builder if contentJson fails a structural sanity check.

### cr16 — landline regex hotfix
- `lib/pipeline/patterns.ts:115` regex updated to handle parenthesised area codes (e.g. `(06) 759 2217`).
- 11 new regex test cases in `patterns.test.ts`.
- Phase 1 item 1 of detection-coverage plan.
- Verified on live instance: GP landline in B1 now flags as `phone`.

### cr17 — Phase 1 bundle
- **Toggle defaults** — `nz-passport` and `vehicle-reg` flipped to `enabled: true` in `DEFAULT_DETECTION_TOGGLES`. Active on demo tenant (confirmed — passport-shape string redacts by default).
- **Env-var split** — `AZURE_OPENAI_DEPLOYMENT_DETECTION` and `AZURE_OPENAI_DEPLOYMENT_CLASSIFICATION` with fallback to shared `AZURE_OPENAI_DEPLOYMENT`. No behavioural change on this tenant (split env vars not set in Azure); future-proofing for any model-split decision.
- **Single-batch guard** — documents with `preparedPages.length ≤ AI_DETECT_SINGLE_BATCH_MAX_PAGES` (default 6) run as a single AI call rather than splitting at BATCH_SIZE=3.
- 5 new unit tests. All green.

### Model-choice spike (completed, documented)
- Ran `o4-mini` on Azure `eastus` vs `gpt-4o` on `australiaeast` against B1.
- 3 runs per condition. Results at `docs/spike-model-comparison-2026-04-20/comparison.md`.
- Outcome: **stay on gpt-4o**. o4-mini did not clear the ≥15pp recall-lift threshold on governance-pathway types (2/3 vs 3/3 on free-and-frank, tied on legal-privilege). Modest wins on third-party-professional detection (Dr Sarah Liang 2/3 vs 0/3, Ben Mahuika 1/3 vs 0/3) and parenthesised phone (3/3 vs 1/3). Latency: ~5.4× slower (prohibitive for user-facing detection).
- Reconsideration triggers captured in Decision (b) of the detection-coverage plan.

### Plan documents
- `docs/detection-coverage-plan-2026-04.md` (v3.1, 987 lines) — fully captures the seven-phase plan.
- `docs/viewer-rework-plan-2026-04.md` (v2) — captures the paused five-phase viewer rework.

---

## Open items / next work

### Detection-coverage — queued next
1. **Phase 2 tranche 3 — CI regression-guard workflow.** PR #23 open, unmerged. Prompt for the workflow + `compare-baseline.ts` was drafted in this session's transcript; actionlint clean; local dry-runs green (same-baseline → exit 0, simulated regression → exit 1). **Secrets setup required** before the first CI run can pass — Eugene to add 5 `AZURE_OPENAI_*` / `AZURE_DI_*` secrets via Settings → Secrets and variables → Actions. Until then the workflow fails fast at the secret-check step by design (zero Azure cost). Estimate: ~15 minutes for Eugene (secrets) then merge.
2. **Phase 3 — prompt rework.** 4–6 engineer-days. 10 new worked examples (9–18), structural-heuristics block, third-party-professional carve-out reword, cache-friendly prompt restructure. **Current governance-pathway F1 0.282 is the target to beat.** The 5-fixture baseline at `docs/bench-baselines/baseline-2026-04-21-5fixtures/` is the regression floor; CI (once tranche 3 lands) will auto-diff Phase 3's changes against it.
3. **Phase 4 — entity propagation.** 5–7 engineer-days. B3 fixture (tranche 2a-ii) specifically exercises this: 4 named individuals with full / honorific / bare-surname variants across pages 2–9. Current bench shows Henderson 53% avg coverage, Valeafou 53% avg coverage (wild per-run variance: run 2 caught page-4/5/7 occurrences, runs 1 and 3 mostly caught parties-table only). Phase 4 goal is deterministic propagation taking coverage to ~100% regardless of run variance.
4. **Phase 5 — label-adjacent detection.** 3–4 engineer-days (regex-over-raw-text path chosen, not DI-tier upgrade).
5. **Phase 6 — structured outputs migration.** 3–5 engineer-days, contingent on Hypothesis B verification.
6. **Tier-2 redaction cap follow-up (issue #20).** 0.5–1 engineer-day. Lift `TEXT_SEARCH_MAX_LENGTH` at `redact-pdf.ts:360` so long-narrative detections auto-redact at export time. Option 1 (raise cap, trust PyMuPDF `search_for`) recommended as first try; chunk-on-split and fuzzy-anchor options documented in the issue. Not a hard blocker for Phase 3/4 but closes the end-to-end loop for governance-pathway content that Phase 3 will produce.

### Detection-coverage — v3.2 amendment (not yet in plan)
- **Medical diagnosis prose** on B1 ("recording a diagnosis of adjustment disorder with mixed anxiety and depressed mood", "ICD-10 F43.23") is not covered by any v3.1 phase.
- Proposed: add worked Example 19 to Phase 3 for personal medical diagnosis in prose under `personal-name` type with ground s7(2)(a). Fold into Phase 3 when reached. ~15-minute amendment.
- Eugene's original concern: "rich contextual AI matching — free and frank opinions, commercial position, trade secrets, health or safety to the public" — v3.1 closed most of this gap; medical-diagnosis-in-prose is the residual.

### Viewer-rework — still paused
- Phase 3 resumes after detection-coverage matures (no strict gate).
- Plan: pdf.js primary viewer, overlay a11y promotion, manual-detection reimplementation on pdf.js text layer, worker bundling, VIEWER_MODE flag.
- 5–7 engineer-days.
- Key decisions already locked in v2: HTML viewer sunset (Decision h — not user-facing, rollback lever only, removed in Phase 5), text layer re-enable, worker bundling.

### Operational follow-ups (observed in cr17 logs, pre-date cr17)
- **LibreOffice javaldx failures** on four DOCX canonical-PDF builds (04:57, 01:44, 03:49 timestamps; docs cmo6hinyq005y01mv9j9hh232, cmo6j89r900e201mv7fgqwsbb, cmo6nop8g000001o933epzpwt). Pipeline falls back to legacy flow. Likely fix: add `default-jre` to Dockerfile's apt install alongside `libreoffice-nogui`, or set `JAVA_HOME` explicitly. **Likely related to Phase 1.5's extraction-quirk investigation.**
- **Prisma transaction timeout** at 01:45:47 on doc cmo6j89ps00e001mvdlv6q347 (18.9s vs 5s budget). Suggests a canonical-PDF write wrapped in a too-tight transaction boundary. Fix path: shorten transaction scope or raise timeout on that specific write.
- **Action recommended:** file both as GitHub issues post-demo for visibility; neither blocks current work.

### Git hygiene
- Create tags `deploy-cr15`, `deploy-cr16`, `deploy-cr17` on the respective merge commits. Low priority; useful for future archaeology by image tag.

### CI/CD migration gap (pre-existing, flagged multiple times)
- Deploy pipeline does NOT run `npx prisma migrate deploy`. None of today's work introduces a migration, so gap doesn't bite. Flagged in `docs/viewer-rework-plan-2026-04.md` implementation log and `docs/detection-coverage-plan-2026-04.md` Phase 2 interaction. Worth closing as its own small PR at some point.

---

## Demo readiness as of handoff

- Landline `(06) 759 2217` redacts on DOCX uploads.
- Driver licence and passport redact on DOCX uploads (both toggles default-on for this tenant).
- Table structure preserved on manual-detection mutations (cr15 fix).
- Long-narrative AI detections (free-frank commentary, legal-privilege sentences, commercial-in-confidence paragraphs >80 chars) now surface in the review UI post Phase-1.75 fix. Reviewer can accept them; redaction at export currently falls back to manual-detection flow for these because Tier-2 auto-redaction still caps at 80 chars (issue #20).
- Known residual misses on B1 (all in scope for detection-coverage phases 3/4/5/6):
  - Dr Sarah Liang, Awatere Medical Centre, Ben Mahuika (third-party professionals) — Phase 3
  - Employee numbers, salary bands — Phase 5
  - ICD-10 codes, Benestar reference — Phase 6
  - Medical diagnosis prose — v3.2 amendment (not yet in plan)
  - Free-and-frank section, settlement range — Phase 3
  - In-prose Ferguson / Kellogg surnames — Phase 4
  - Witness names (Briggs, Sharma, Rauhihi) — Phase 3 examples + Phase 4

---

## How to pick up in a fresh conversation

1. Read `docs/detection-coverage-plan-2026-04.md` (v3.1) for the detection-coverage plan.
2. Read `docs/viewer-rework-plan-2026-04.md` (v2) for the viewer-rework plan.
3. Read this file (`docs/session-handoff-2026-04-21.md`) for state through 2026-04-21.
4. Read `docs/bench-baselines/README.md` for the bench harness + CI operation.
5. Read `docs/phase-1-75-ai-detection-stripping-findings.md` if touching `lib/pipeline/bbox.ts` or the bbox-enrichment block in `process.ts`.
6. Check `git log --oneline -30` for recent merge commits (PRs #15/16/18/21/22 are the 2026-04-21 bench landings).
7. Check `https://veil.datasing.nz` is live.
8. Decide next work: (a) Eugene adds GitHub secrets + merge PR #23 to wire the CI regression guard; (b) start Phase 3 prompt rework against the 5-fixture baseline; (c) tackle issue #20 (Tier-2 cap) to close the redaction loop for long-narrative detections; (d) v3.2 medical-diagnosis amendment.

---

## Conversations I've had with Eugene today (context for tone / preferences)

- British English, minimal formatting, conversational prose preferred over heavy bullet lists.
- Eugene is a non-developer founder. He executes via Claude Code for all code work. Prompts should be structured, specific, and include preflight / verify / rollback steps.
- Eugene prefers sequenced small deploys (hotfix → bundle) over big single PRs, after we adopted that pattern today for Phase 1.
- All current documents on `veil.datasing.nz` are test / dummy data — no production reviewer decisions need preserving. Reprocess at will on this instance.
- Demo pressure eased at end of day — demo successful earlier, no imminent demo obligation.
