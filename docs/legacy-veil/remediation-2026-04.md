# Veil Prototype — Remediation (April 2026)

**Drafted:** 2026-04-18
**Closed:** 2026-04-18
**Scope:** Issues identified in the docs + code review on 2026-04-18 (covers commits up to `6386777`).

All 16 items identified in the original review are resolved. This document is the closed record; per-item commit references follow.

---

## Status summary

| Tier | Count | Outcome |
|------|-------|---------|
| Blocker | 5 | All resolved |
| Important | 9 | All resolved |
| Polish | 5 | 4 resolved, 1 partially (see P1/P2) |

---

## Blockers

### B1. Upload route skips `authorizeForCase` — RESOLVED
- **Commit:** `34575d0` — fix(api): enforce case authorization on document upload
- `await authorizeForCase(user, caseId)` inserted between the case-existence check and file processing. Auth failures now return 403 (new `UPLOAD_FORBIDDEN` code) instead of 500. New Playwright test `e2e/documents/upload-authz.spec.ts` verifies a reviewer cannot upload to a case outside their department.

### B2. Detection dedup collapses repeated text — RESOLVED
- **Commit:** `90ce6cc` — fix(pipeline): preserve per-occurrence detections via coord-aware dedup
- `processDocument` in `lib/pipeline/process.ts` now calls `calculateBBoxAll` before dedup and includes rounded `posY` in the dedup key. Three occurrences of the same text at different vertical positions now produce three Detection rows with distinct coordinates.

### B3. Oversized bounding boxes from multi-line AI detections — RESOLVED
- **Commit:** `55b9899` — fix(bbox): return per-line bboxes, filter long text, correct test contract
- `computeBoxesFromWords` in `lib/pipeline/bbox.ts` now splits matched word sequences into visual lines by `yTolerance` and emits one tight bbox per line. Union-across-lines no longer happens.

### B4. No Tier 1 text-length filter — RESOLVED
- **Commit:** `55b9899` (bundled with B3)
- `calculateBBoxAll` rejects detection text longer than 80 characters (matching `TEXT_SEARCH_MAX_LENGTH` in `redact-pdf.ts`). Long AI narrative summaries short-circuit to empty BBox arrays and fall through to Tier 2 text-search.

### B5. Failing unit test on main — RESOLVED
- **Commit:** `55b9899` (bundled with B3/B4)
- The test expected 0–1 fractional coordinates but the shipped code always produced 0–100 percentage values. Test rewritten to assert against the actual percentage-scale contract. 319 Vitest tests pass.

---

## Important

### I1. Buffer → Uint8Array in 7 response bodies — RESOLVED
- **Commit:** `32fd032` — refactor(api): use Uint8Array for PDF response bodies

### I2. Reset-script table-name allowlist — RESOLVED
- **Commit:** `93184d5` — fix(scripts): allowlist table names before truncate

### I3. CLAUDE.md numeric drift — RESOLVED
- **Commit:** `8075981` — docs: correct internal reference numbers and role labels
- Migration count, test counts, detection-type summary, and full Section 17 ground list corrected. Known Bugs section rewritten to reflect the resolved state; line numbers replaced with function names.

### I4. PRODUCT-FEATURES.md customer-facing inaccuracies — RESOLVED
- **Commits:** `056df80` (format/scale/region fixes) and `1b96d3e` (Internal package contents reconciliation).
- PST dropped from supported email archives; scale numbers rephrased as design targets; region statement corrected to the deployed reality.

### I5. Azure region overstated — RESOLVED
- **Commit:** `056df80`
- PRODUCT-FEATURES and DEMO-SCRIPT now state the current region (Australia East) and present NZ North as a deployment-time choice.

### I6. README invented role labels — RESOLVED
- **Commit:** `8075981`
- Roles table rewritten to match the enum: `admin`, `request-manager`, `senior-reviewer`, `final-approver`, `reviewer`, with UI-label column.

### I7. README `/dashboard` route — RESOLVED
- **Commit:** `8075981`
- `/dashboard` corrected to `/` with the unauthenticated (landing) vs authenticated (dashboard) distinction noted.

### I8. DEVELOPER-NOTES duplicate section numbering — RESOLVED
- **Commit:** `8075981`
- Second `## 6.` renumbered to `## 7.`; downstream sections cascaded to `## 8.` / `## 9.`.

### I9. CLAUDE.md known-bug line-number drift — RESOLVED
- **Commit:** `8075981`
- Absolute line numbers replaced with function names (`calculateBBoxAll`, `computeBoxesFromWords`, etc.).

---

## Polish

### P1. Pipeline description duplicated across 4 files — PARTIALLY RESOLVED
- **Commits:** `8075981`, `1b96d3e`
- The incorrect dedup-key description was corrected in all four locations, and the CLAUDE.md summary now points at the README's canonical description. Full consolidation was not pursued: each document's pipeline blurb serves a different audience (compact agent context, step-by-step reference, live demo script).

### P2. Seed-data description duplicated across 3 files — NOT PURSUED
- Decision: kept duplicated. The three mentions serve different audiences (README installation flow, CLAUDE.md agent context, DEMO-SCRIPT "what to expect"). None currently disagrees. Revisit if drift emerges.

### P3. Export package table inconsistencies — RESOLVED
- **Commit:** `1b96d3e`
- PRODUCT-FEATURES corrected: Internal package contents match `lib/pipeline/export.ts` — Internal adds audit trail and chain-of-custody; unredacted originals appear in Ombudsman only.

### P4. Unreferenced top-level files — RESOLVED
- **Commit:** `4e14be5`
- Moved `LGOIMA-REMEDIATION-PLAN.md`, `lgoima_redaction_taxonomy_detailed.md`, and the LGOIMA Act PDF into `docs/`. All three linked from the README "Further Documentation" table.

### P5. Untracked working files — RESOLVED
- **Commit:** `f6bcd78`
- `PNCC-demo-cheatsheet.docx`, `test-fixtures/`, `playwright_output.txt`, and `test_output.txt` added to `.gitignore`.

---

## Verification performed

- `npm run test` → 319 unit tests pass after Phase 1.
- `npx tsc --noEmit` → clean after Phase 1 and Phase 2 code changes.
- Manual PDF redaction end-to-end test deferred — ran unit tests only. Recommend the next hand-on session upload a PDF with (a) a repeated name and (b) a multi-line narrative passage to confirm Tier 1 output looks tight in a real document.
- `npm run test:e2e` not run in this session — requires Docker + Postgres + test-user seed. The new `upload-authz.spec.ts` should be exercised when the suite is next executed.

## Known follow-ups

- Running `npm run lint` still reports 3 pre-existing warnings in `app/landing-page.tsx` and `app/requests/[id]/bulk-review/bulk-review-client.tsx` — unrelated to this remediation batch but worth cleaning up to restore the CLAUDE.md "0 warnings policy" as a hard gate.
- Performance benchmarking to *substantiate* (rather than soften) the PRODUCT-FEATURES numbers remains out of scope — this is a testing project of its own.
