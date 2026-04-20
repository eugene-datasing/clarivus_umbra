# Session handoff — 2026-04-20 (end of day)

Purpose: capture state sufficient to continue the detection-coverage and viewer-rework work streams in a fresh conversation without losing context.

---

## Current state

### Deployed (veil.datasing.nz)
- **cr17** live. Phase 1 of detection-coverage complete.
- All deploys today functionally verified on the live instance.

### Git state
- `main` contains everything from today.
- PRs merged today: #6 (spike artefacts), #7 (detection-coverage plan v3.1), #8 (viewer-rework plan v2 revisions), #9 (landline regex hotfix, cr16), #10 (Phase 1 bundle, cr17).
- Earlier: PR #5 (content-rebuild fix, cr15) — merged before today.
- All branches deleted post-merge.
- **No git tags** have been created (`deploy-cr15`, `deploy-cr16`, `deploy-cr17` would be useful archaeology; low priority).

### Working tree
- Clean at time of handoff (nothing uncommitted that isn't captured here).

---

## What shipped today

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
1. **Phase 1.5 — extraction-quirk investigation.** 0.5–1 engineer-day. Investigate why B1's DOCX extracts to a single canonical page post-LibreOffice. **Blocks Phase 4** (entity propagation premise depends on this outcome). Watch for interaction with the LibreOffice javaldx warnings below — may be the same root cause.
2. **Phase 2 — benchmark harness + ground-truth authoring.** 6–9 engineer-days. Includes authoring B1.expected.json (Eugene) and C1/A/B3 (Claude draft, Eugene review). New fixture: `C1_Tender_Evaluation_Commercial.docx` (commercial pathway).
3. **Phase 3 — prompt rework.** 4–6 engineer-days. 10 new worked examples (9–18), structural-heuristics block, third-party-professional carve-out reword, cache-friendly prompt restructure.
4. **Phase 4 — entity propagation.** 5–7 engineer-days, contingent on Phase 1.5 outcome.
5. **Phase 5 — label-adjacent detection.** 3–4 engineer-days (regex-over-raw-text path chosen, not DI-tier upgrade).
6. **Phase 6 — structured outputs migration.** 3–5 engineer-days, contingent on Hypothesis B verification.

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
- Known residual misses on B1 (all in scope for detection-coverage phases 3/5/6):
  - Dr Sarah Liang, Awatere Medical Centre, Ben Mahuika (third-party professionals) — Phase 3
  - Employee numbers, salary bands — Phase 5
  - ICD-10 codes, Benestar reference — Phase 6
  - Medical diagnosis prose — v3.2 amendment (not yet in plan)
  - Free-and-frank section, settlement range — Phase 3
  - In-prose Ferguson / Kellogg surnames — Phase 4 (contingent on 1.5)
  - Witness names (Briggs, Sharma, Rauhihi) — Phase 3 examples + Phase 4

---

## How to pick up in a fresh conversation

1. Read `docs/detection-coverage-plan-2026-04.md` (v3.1) for the detection-coverage plan.
2. Read `docs/viewer-rework-plan-2026-04.md` (v2) for the viewer-rework plan.
3. Read this file (`docs/session-handoff-2026-04-20.md`) for today's state.
4. Check `git log --oneline -20` to see the cr15/cr16/cr17 merge commits.
5. Check `https://veil.datasing.nz` is live (cr17).
6. Decide next work: Phase 1.5 is the natural next step; alternatively file operational issues or tackle the v3.2 medical-diagnosis amendment.

---

## Conversations I've had with Eugene today (context for tone / preferences)

- British English, minimal formatting, conversational prose preferred over heavy bullet lists.
- Eugene is a non-developer founder. He executes via Claude Code for all code work. Prompts should be structured, specific, and include preflight / verify / rollback steps.
- Eugene prefers sequenced small deploys (hotfix → bundle) over big single PRs, after we adopted that pattern today for Phase 1.
- All current documents on `veil.datasing.nz` are test / dummy data — no production reviewer decisions need preserving. Reprocess at will on this instance.
- Demo pressure eased at end of day — demo successful earlier, no imminent demo obligation.
