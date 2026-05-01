# Veil-era branches (archived)

These local branches existed at the time of the Umbra fork from Veil. They were preserved on the `DataSing/clarivus_veil` remote (which is left untouched by the Umbra rework — Veil is a live product). They are not pushed to `eugene-datasing/clarivus_umbra`. The list below is a static snapshot for traceability; recover any branch from `clarivus_veil` if needed.

| Branch | HEAD | Subject |
|---|---|---|
| `chore/commit-spike-artefacts` | `e06a746` | chore: remove unknown-rule eslint-disable in spike script |
| `ci/deploy-polish` | `161379b` | ci(deploy): polish workflow — fix log-tail hang, add post-verify settle re-check |
| `ci/deploy-settle-retries` | `811e60c` | ci(deploy): retries-with-backoff in settle re-check to filter HTTP=000 transient |
| `ci/deployment-automation` | `182dee4` | ci(deploy): automate Azure deploy on merge to main |
| `ci/docker-build-on-pr` | `815a530` | ci(docker): add pull_request trigger for pre-merge build verification |
| `docs/detection-coverage-plan-v3-1` | `8ee9344` | docs: detection-coverage improvement plan (v3.1) |
| `docs/phase-1-5-extraction-findings` | `6cf378c` | docs: Phase 1.5 extraction-quirk investigation findings |
| `docs/scanned-handwritten-gap` | `3944d82` | docs: log scanned/handwritten document handling architectural gap |
| `docs/session-handoff-2026-04-20` | `80754ab` | docs: end-of-day session handoff 2026-04-20 |
| `docs/session-handoff-2026-04-21` | `f954750` | docs: carry session handoff forward to 2026-04-21 |
| `docs/viewer-rework-plan` | `6607cec` | docs: viewer rework implementation plan (April 2026) |
| `docs/viewer-rework-plan-v2-revisions` | `cb3bcc8` | docs: viewer-rework plan v2 revisions |
| `feat/canonical-bbox-phase-2` | `2c1f988` | test(phase2): unit + integration + e2e coverage for DI-on-canonical path |
| `feat/canonical-pdf-phase-1` | `88615f1` | docs: update phase 1 implementation log with remaining deferred items |
| `feat/phase-1-bundle-toggles-envs-batch-guard` | `d39e59e` | feat(detection): Phase 1 bundle — toggle defaults, env-var split, single-batch guard |
| `feat/phase-2-bench-ci-workflow` | `1ed2956` | feat(bench): Phase 2 tranche 3 — CI regression guard |
| `feat/phase-2-bench-fixtures` | `ead3ce9` | feat(bench): Phase 2 tranche 2a-i — benchmark fixtures |
| `feat/phase-2-bench-infrastructure` | `8d3ca69` | feat(bench): Phase 2 tranche 1 — scoring library + runner skeleton |
| `feat/section-marker-detect-free-frank` | `e0e319a` | fix(section-marker): sub-section termination + sentence-level emission |
| `fix/b1-fixture-missing-from-repo` | `58ed0fb` | bench: raise per-fixture CI threshold 8pp -> 12pp to absorb AI noise |
| `fix/citation-fallback-and-bulk-normalisation` | `abeac00` | fix(review): citation fallback + bulk-accept normalisation (Bug 2) |
| `fix/content-rebuild-table-preservation` | `f2b01f5` | fix(content): preserve table structure on manual-detection mutations |
| `fix/detection-coverage-dl-and-dob` | `42a0d35` | docs: session handoff 2026-04-19 |
| `fix/docker-postinstall-script-missing` | `3feb196` | fix(build): stage postinstall script into Stage 1 so npm ci finds it |
| `fix/dual-panel-ux-laptop-and-citations` | `cc0ed1c` | fix(review): dual-panel UX — lower breakpoint, sidebar toggle, ground citations |
| `fix/landline-regex-parenthesised-area-codes` | `fab8e09` | fix(patterns): match NZ landline numbers with parenthesised area codes |
| `fix/manual-detection-grounds-and-bbox` | `5b774af` | fix(review): manual-detection grounds dropdown + server-side bbox |
| `fix/manual-detection-multiline-and-long-text` | `7620059` | fix(review): manual detections — long text + multi-line (Bug 5) |
| `fix/redact-pdf-coordinate-dedup` | `be5effd` | fix(redact-pdf): coordinate-mode dedup eliminates double-citation on output PDF |
| `fix/redaction-rectangle-grow-on-accepted` | `04299f5` | fix(review): grow accepted right-pane rectangles to match pending (Bug 3) |
| `fix/server-actions-stable-hash` | `eb000c3` | fix(deploy): stabilise server-action hashes across deploys + popover error surface |
| `fix/viewer-dual-panel-rendering` | `f896f34` | fix(viewer): remove highlight borders, increase size slightly, prevent cross-pane selection |
| `fix/viewer-overlay-dedup-keyboard` | `92513b3` | fix(viewer): normalise newlines in pdf-handler selection text |
| `fix/zero-bbox-ai-long-narrative` | `38680ef` | fix(pipeline): close systemic zero-bbox AI long-narrative redaction failure |
| `main` *(prior canonical Veil main, superseded by `feat/parallel-ai-batches` one commit later)* | `5b88144` | fix(pipeline): close systemic zero-bbox AI long-narrative redaction failure (#64) |
| `phase-3-5-investigation` | `96560b6` | Phase 3.5 spike iteration 3: narrowed V5 (witnesses-only scope) |
| `phase-3-5-patch` | `20d28ee` | docs: refresh detection-coverage and viewer-rework plans after Phase 4 landing (+ Phase 3.5 addition) |
| `phase-3-option-c-fixture-generator` | `b3dea48` | chore(scripts): add scanned-simulation fixture generator for Option C validation |
| `phase-3-option-c-scanned-fixture` | `c6bd6ed` | Phase 3 prerequisites: canonical_pdf_text_selectable column + PDF storage decision |
| `phase-3-prereqs-canonical-text-selectable` | `c6bd6ed` | Phase 3 prerequisites: canonical_pdf_text_selectable column + PDF storage decision |
| `phase-3-slice-a-viewer-infrastructure` | `05ba510` | feat(viewer): Slice A — PDF viewer infrastructure + VIEWER_MODE flag |
| `phase-3-slice-b-dual-panel` | `d3a9004` | feat(viewer): Slice B — dual-panel PDF layout |
| `phase-3-slice-c-option-c-manual-detect` | `e319741` | feat(viewer): Slice C — Option C routing + pdf.js manual detection |
| `phase-3-slice-d1-e2e-migration` | `cdc25fd` | test(e2e): Slice D1 — PNCC seed migration + review-PDF project + flake fix |
| `phase-3-slice-d2-cutover` | `83efff1` | feat(viewer): Slice D2 — flip default VIEWER_MODE to "pdf" + amend plan |
| `phase-6-structured-outputs` | `8643e28` | docs(retrospective): add directional-vs-N=10-median lift pattern as a lesson |
| `remediation/tier1-and-docs` | `2c45d17` | chore(lint): clear pre-existing warnings blocking CI |
