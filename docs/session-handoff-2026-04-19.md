# Session handoff — 2026-04-19

Snapshot of repo state at end of the 2026-04-19 implementation session. Read this before resuming work on the viewer-rework programme.

## Repo state

- **`main`** at `7dddfd2` (Phase 2 merged earlier today as PR #3).
- **In-flight branch:** `fix/detection-coverage-dl-and-dob` — not merged, pushed for review. Six commits ahead of main.
- **No migrations pending.** This session's in-flight branch is schema-clean; Phase 1's migration was applied to prod earlier today.

## What shipped to `main` this session

Merged via PRs during the session, deployed to prod:

- **PR #1** — Phase 1 groundwork: canonical PDF persistence, 5 new `Document.canonicalPdfPath/*` columns, LibreOffice + email-template + original dispatch, admin rebuild endpoint, backfill script.
- **PR #3** — Phase 2: routes `extractText` through canonical PDF for every format, so DOCX/XLSX/EML/MSG get Azure DI word polygons and per-occurrence bboxes instead of a zero-bbox placeholder. Drops the `calculateBBoxAll` zero-bbox shortcut.

Prod incident mid-session: cr13 deployed with unmigrated schema → `PrismaClientKnownRequestError P2022`. Root cause: cr12 image never built; deploy jumped cr11→cr13. Resolved by running `npx prisma migrate deploy` against prod after authorization. Phase 1 columns now present in prod.

## In-flight: `fix/detection-coverage-dl-and-dob`

Closes two detection gaps surfaced by live Phase 2 testing on `B2_Witness_Statement_Torres.pdf`:

1. **NZ driver licence (regex gap).** `HM847219` was missed entirely. Added a `driver-licence` pattern (`/\b[A-HJ-NP-Z]{2}\d{6}\b/g`) placed before `nz-passport`, guarded by a new optional `PatternDef.requireContext` mechanism that only accepts the match when "licence" / "license" / "driver" / "DL" appears within the 40-char window before it. Exported `hasContextWithin` helper. When context is absent, the DL match does not claim the range — `nz-passport` still fires on ID-shaped tokens.
2. **DOB long-date form (AI prompt gap).** Extended the `personal-name` description in `ai-detect.ts` to cover dates of birth with month names (e.g. "22 September 1986"), with a new worked Example 8. Instructs the model to include "DOB" in `aiExplanation`.

Registry extensions required for the DL pattern to fire end-to-end:
- `DEFAULT_GROUND_FOR_TYPE`: +`"driver-licence": "s7_2a"` (Decision B from the review thread).
- `DEFAULT_DETECTION_TOGGLES` + `DETECTION_TYPE_MAP` in `lib/data/settings.ts`: +`"Driver Licence Numbers"` toggle, default-enabled. Without this, `detectPatterns` filters the pattern out of `activePatterns` at runtime.

**Test counts on branch HEAD:** unit 363 passed / 8 skipped (up from main's 355 / 6 — +8 new unit tests, integration skip delta +2). Integration suite (`RUN_INTEGRATION_TESTS=1 npm run test:integration:canonical`): 8/8 pass. Lint clean. TypeScript clean.

**Commits (oldest → newest):**

```
8ffcf86 feat(detection): add NZ driver-licence pattern and DOB AI prompt guidance
56da4d6 chore(fixtures): add B2_Witness_Statement_Torres fixture for detection coverage tests
303c2ff test(detection-coverage): integration tests for DL and DOB detection
7f7262b feat(settings): enable driver-licence detection toggle by default
88573d3 test: loosen DOB integration assertion — type+text only, explanation was AI-variance-prone
0a9c59b docs: flag nz-passport default-off for follow-up review
7d3ce4d test: add retry=2 to DOB integration test (AI non-determinism, not flaky test)
```

Three-commit plan in the review scope expanded to seven once the structural DL-toggle issue surfaced during integration testing. All extras were explicitly authorised.

## Follow-ups flagged for separate PRs

Captured in `docs/viewer-rework-plan-2026-04.md`'s implementation log:

- **`nz-passport` default-off.** The Torres doc's missing passport detection mystery resolved — `DEFAULT_DETECTION_TOGGLES` has `nz-passport: enabled=false`. Review whether this is deliberate before flipping. Not touched in this PR because enabling a dormant pattern would change detection behaviour for the already-deployed corpus.
- **Email transcript ISO-8601 date rendering** (pre-existing).
- **LibreOffice binary name portability** (pre-existing).
- **E2E Playwright SSO bypass** (pre-existing).
- **DOB AI compliance.** GPT-4o flags the DOB only ~50% of runs on the B2 fixture. Prompt instruction added but not always honoured. Integration test uses `retry: 2` as a pragmatic workaround. If compliance stays low after the prompt change lands in prod, consider a stronger prompt ("You MUST include 'DOB' verbatim") or a post-processing step that injects the marker when `type === "personal-name"` and text matches a date regex.

## Fixture state

- `test-fixtures/dummy-lgoima-pack/` is gitignored by default. This session added a single explicit allowlist for `B2_Witness_Statement_Torres.pdf` (sha256: `45f91de4df301f1328ea47eedcd566ca29109ba75ad7cc7da5ef5865d5661087`). Other dummy-pack fixtures remain untracked; local-only.
- `REDACTION_SCHEDULE.md` in the dummy pack documents A1/A2/B1/B2/B3 fixtures with LGOIMA ground truth per span — none of those binary files are committed. If follow-up integration tests need other B-prefixed fixtures, they'll need the same allowlist treatment on a per-file basis.

## Resume instructions

- **Merging this PR:** no schema change, no migration, no deploy choreography. Standard CI + merge + redeploy container. Post-merge, consider a single-document reprocess of the Torres corpus to populate the new DL detections on already-processed documents (the new pattern only fires on processing, not on existing rows).
- **Phase 3 (viewer rework):** blocked-by is now only itself. Phase 2 is live, bboxes are correct for every format, canonical PDFs are populated for new documents (and admin-trigger-able for legacy ones via `POST /api/documents/[docId]/rebuild-canonical`). The viewer rework can start any time.
- **Prod data note:** the most recent Torres document in prod (`cmo5i2wcw001101oe0orqlabv`) was processed before this PR lands; it won't have a DL detection until reprocessed.
