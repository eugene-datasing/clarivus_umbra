# Umbra v1 Implementation Plan

## Context

Veil (`veil-prototype`, this checkout) was built as a working POC of an LGOIMA disclosure workflow for Palmerston North City Council on the NPDC RFP P26-138. The product is being reframed as **Umbra** — a simpler, single-tenant PII redaction tool for NZ councils and central-government agencies that drops the disclosure workflow and keeps the redaction core.

The fork is **strip-in-place**: same git history, new remote (`eugene-datasing/clarivus_umbra`), tagged `v0.0.0-umbra-fork` at the transition. The current-state survey (`docs/umbra-current-state-survey.md`) is the ground truth for what's wired today; this plan turns that survey + the locked decisions into an executable phasing.

**Outcome.** A shippable Umbra v1 that meets the must-have requirements (REQ-001 .msg/.eml ingestion, REQ-005 NZ Driver Licence, batch concept replacing cases, REQ-016 Purge Now, REQ-015 configurable retention) and deploys to Azure Australia East.

**Locked decisions, in summary.** Two roles (admin, reviewer); no Department concept; fresh `0001_init` schema; rename `Case → Batch` and `caseId → batchId`; rename `driver-licence → nz-driver-licence` (count stays at 22); soft-delete with 7-day grace + 14-day retention default; single-package export; 7→5-step setup wizard; SCIM out; AI governance and custom rules in but with `suggestedGround` rework.

---

## Phase 0 — Pre-flight & Decision Gates

**Goal.** Resolve the things that block everything else before any code moves: Azure region availability, branding-asset readiness, git remote prep, and the unresolved design questions called out at the bottom of this plan. No code changes.

**Scope.**
- Verify Azure OpenAI (GPT-4o) and Document Intelligence `prebuilt-read` deployment availability in Australia East (Veil already deploys here; both services are GA).
- Confirm: target domain (placeholder `umbra.<tbd>.nz`), Umbra brand name approval, logo + palette assets ready for handoff.
- Resolve the Phase 0 open questions (see "Open questions" section): scheduler tech, audit-archive format, ExportJob disposition, custom-rules ground rework, generic seed-council name.
- Set up the new GitHub remote (`eugene-datasing/clarivus_umbra`) and rehearse the rename / push.

**Out of scope.** Any code changes; provisioning Azure resources (Phase 11).

**Files touched.** None.

**Sequencing.** All checks happen in parallel. Region check is the longest pole (may need a vendor query).

**Exit criteria.**
- Azure region confirmed: Australia East. REQ-017 divergence formally documented (see Plan-level concerns).
- All five open questions answered.
- Branding assets in hand or on a known delivery date.
- New GitHub remote ready (empty repo, default branch protections).

**Rollback.** N/A — pre-flight only.

**Effort.** 0.5–1 person-day (mostly waiting on external answers).

**Dependencies.** None.

---

## Phase 1 — Repo separation + rebrand

**Goal.** Establish Umbra's identity at the package and repo level without touching feature code.

**Scope.**
- Tag current `feat/parallel-ai-batches` (or `main` after merging) as `v0.0.0-umbra-fork`.
- Rename `package.json` `name` from `veil-prototype` → `umbra-prototype`; bump version to `0.1.0-umbra`.
- Update `package-lock.json` via `npm install`.
- **Safe remote rewire** (Veil is a live product at `DataSing/clarivus_veil` and must remain untouched):
  1. Verify current `origin` points at `git@github.com:DataSing/clarivus_veil.git`.
  2. Rename it: `git remote rename origin veil-archive` (or remove: `git remote remove origin`). Local Veil history is preserved either way.
  3. Add new remote: `git remote add origin git@github.com:eugene-datasing/clarivus_umbra.git` (or `https://github.com/eugene-datasing/clarivus_umbra.git`).
  4. Confirm `git remote -v` — `origin` points at the new repo and no fetch/push targets `clarivus_veil`.
  5. Do not push, fetch, or modify `clarivus_veil` from this checkout going forward.
  6. Tag the transition (`v0.0.0-umbra-fork`) and push the current branch + tag to the new `origin` only.
- Update top-of-file branding in `README.md`, `DEVELOPER-NOTES.md`, `CHANGELOG.md`, `CLAUDE.md` with a transition banner (full doc cleanup is Phase 9).
- Replace `app/layout.tsx` `<title>` and `<meta>` description (deeper UI string sweep is Phase 9).
- Add `docs/umbra-current-state-survey.md` and `docs/umbra-implementation-plan.md` (the latter is the post-approval write of this plan).

**Out of scope.** Logo / favicon swap (Phase 9 — bundled with full UI string sweep). Feature changes. Schema changes.

**Files touched.** `package.json`, `package-lock.json`, `README.md`, `DEVELOPER-NOTES.md`, `CHANGELOG.md`, `CLAUDE.md`, `app/layout.tsx`. New: `docs/umbra-implementation-plan.md`.

**Sequencing.** Tag → push to new remote → package rename → docs banner.

**Exit criteria.**
- `git remote -v` shows the new `umbra` remote.
- `npm install` succeeds; `npm run build` succeeds.
- `v0.0.0-umbra-fork` tag exists on both old and new remotes.

**Rollback.** Pre-tag is preserved; rename is reversible via Edit.

**Effort.** 0.5 person-day.

**Dependencies.** Phase 0 (remote ready, brand approved).

---

## Phase 2 — Schema reboot

**Goal.** Replace the 19-model Veil schema with a fresh `0001_init` for Umbra: drop disclosure-workflow models, rename `Case → Batch`, reshape milestones to 3 stages, add soft-delete + cascade fixes.

**Scope.**

*Models to drop entirely* (current `prisma/schema.prisma` lines):
- `Department` (34-48) and the `User.departmentId`/`User.department` FK (20, 26).
- `CaseMilestone` (275-290) — replaced by `BatchMilestone` (smaller).
- `CaseAssignment` (292-311) — gone.
- `DetectionSnapshot` (313-325) — gone.
- `FeedbackExample` (327-346) — gone (and the `Detection.feedbackExample` relation at 187, `Document.feedbackExamples` at 133, `Case.feedbackExamples` at 72).
- `ProcessingJob` (407-423) — gone (queue UI is also being simplified).
- `UserInvitation.departmentId` (370) — removed.

*Renames.*
- `Case` → `Batch`; `@@map("cases")` → `@@map("batches")`.
- `caseId` columns → `batchId` on `Document` (82), `AuditEntry` (203), `ExportJob` (385). All FK relations renamed.
- `getNextReference()` reference format `LGOIMA-YYYY-NNN` → `BATCH-YYYY-NNN` (in `lib/data/cases.ts` → renamed to `lib/data/batches.ts` in Phase 4).

*Batch name field.* Add `name String` (required, max 80 chars) to `Batch`, alongside the auto-generated reference (`BATCH-YYYY-NNN`). Per US-002 ("group uploaded documents into named batches"), the user names the batch on creation (e.g. 'May submission responses'); reference remains the system identifier.

*New shape — `BatchMilestone`.* Replaces `CaseMilestone` with three stages only: `upload | review | export`.

```prisma
model BatchMilestone {
  id          String    @id @default(cuid())
  batchId     String
  stage       String    // "upload" | "review" | "export"
  completedAt DateTime?
  batch       Batch     @relation(fields: [batchId], references: [id], onDelete: Cascade)
  @@unique([batchId, stage])
}
```

*Soft-delete on Batch.* Add `deletedAt DateTime?`, `purgeScheduledAt DateTime?`, `purgedAt DateTime?`, and `purgeStatus String?` (values: `null | "scheduled" | "purging" | "archived"`) columns. Add `@@index([deletedAt])` and `@@index([purgeScheduledAt])` for the retention worker.

*Cascade fixes (closes the orphan paths flagged in survey Q5).*
- `AuditEntry.batch` → add `onDelete: Cascade` (currently no rule at schema:211).
- `ExportJob.batch` → add `onDelete: Cascade` (currently no rule at schema:386).
- `FileUpload` — add `batchId` FK with `onDelete: Cascade` (currently has no FK at all, schema:219).

*Detection schema cleanup.* Drop `suggestedGround`, `appliedGround`, `piConsideration` from `Detection` (lines 171-172, 175). Replace with a single `note: String?` field for reviewer rationale. The Zod ground-validation set (`lib/validation/schemas.ts:21-31`) collapses with this.

*ActivationCode.* Keep as-is (lines 348-363). Single-tenant deployments still benefit from the activation flow.

*UserInvitation.* Drop `departmentId` (line 370). Role default `"reviewer"` stays.

*Migration handling.* Per locked decision: delete `prisma/migrations/` entirely and write a single new `0001_init` from the rewritten `schema.prisma`. Run `npx prisma migrate dev --create-only --name init` to generate, then commit. Local dev DB will need `npx prisma migrate reset` (with consent flag) or a fresh Docker volume.

**Out of scope.** Application code paths that reference dropped models / renamed fields (Phase 3, 4). Custom-rules `suggestedGround` (Phase 8 — covered with admin UI rework).

**Files touched.** `prisma/schema.prisma`, `prisma/migrations/` (deleted + regenerated), `prisma/seed.ts` (will be largely rewritten in Phase 9 — leave broken until then). Initial code-level callouts (broken in this phase, fixed in 3+4): `lib/data/cases.ts:46-57` (reference format), all `caseId` literal references in queries.

**Sequencing.**
1. Snapshot current schema for diffing.
2. Edit `schema.prisma` (drops + renames + new `BatchMilestone` + soft-delete columns + cascade fixes).
3. `rm -rf prisma/migrations/`.
4. Run Prisma migrate to generate `0001_init`.
5. Run `prisma generate` to refresh `lib/generated/prisma`.
6. **Build will fail** — that's expected; Phase 3+4 follow.

**Exit criteria.**
- Single migration file at `prisma/migrations/0001_init/`.
- `npx prisma migrate reset --force` (with consent env) succeeds against a clean Docker DB.
- `npx prisma generate` produces a typed client.
- `tsc --noEmit` produces a finite, expected error list (renames need follow-up, no schema-side errors).

**Rollback.** Branch-level: revert the schema commit. Database: `npx prisma migrate reset` to old migrations. The fresh-init choice means *deployed* environments cannot roll back without data loss — but no deployed Umbra environments exist yet.

**Effort.** 2–3 person-days. The schema edit itself is hours; the verification (cascade behavior, raw SQL audit-hash compatibility under the rename) is the bulk.

**Dependencies.** Phase 1 (rebrand). Blocks Phases 3, 4, 5, 6, 7.

---

## Phase 3 — Roles collapse + auth simplification

**Goal.** Single source of truth for roles. Delete every scattered hard-coded list found in survey Q2; downstream auth rewires to `admin | reviewer`. Drop department-based authorization.

**Scope.**

*New file* `lib/auth/roles.ts` with the canonical enum and helpers:

```ts
export const ROLES = ["admin", "reviewer"] as const;
export type Role = typeof ROLES[number];
export const isAdmin = (r: string | undefined): r is "admin" => r === "admin";
export const isReviewer = (r: string | undefined): r is "reviewer" => r === "reviewer";
```

*Files that import the canonical list (replacing hard-coded literals from survey Q2):*
- `middleware.ts:50` — `adminRoles` array → `[ "admin" ]` (sourced from `ROLES`).
- `lib/auth/authorize.ts:13-17` — `PRIVILEGED_ROLES` → deleted; replaced with `isAdmin()` checks.
- `lib/auth/authorize.ts:26-61` — `authorizeForCase()` rewritten as `authorizeForBatch(user, batchId)`: admins always pass; reviewers pass if assigned to the batch (no department logic). The `Case.departments[]` array → dropped from the schema in Phase 2.
- `lib/auth/authorize.ts:67-87` — `authorizeForDocument()` updated to call `authorizeForBatch()`.
- `lib/auth/authorize.ts:130-140` — `requireAdmin()` simplified to `isAdmin(user.role)`.
- `lib/auth/auth.config.ts:67` — admin-roles literal → import from `lib/auth/roles.ts`.
- `lib/data/pipeline.ts:11-18, 109-123` — entire file deleted in Phase 4.
- `lib/actions/detection-actions.ts:551` — `applyConfidenceThreshold()` role gate becomes `isAdmin()`.

*UI components.*
- `components/layout/sidebar.tsx:40-44, 109-114` — `roleLabels` map shrinks to 2 entries; `canAccessAdmin = isAdmin(userRole)`.
- `app/admin/settings/settings-client.tsx:67-81` — role badge map shrinks to 2.
- `app/setup/setup-wizard-client.tsx:1181-1182` — role dropdown to 2 entries.

*Tests to update.*
- `lib/auth/__tests__/authorize.test.ts:24-25, 34-35` — assertions updated for 2-role world.
- `e2e/auth/rbac.spec.ts` — role matrix collapses to 2.

**Out of scope.** Department-removal UI (Phase 4 — bundled with workflow-simplification UI churn). SCIM removal (Phase 4).

**Files touched.** ~10 source files + 2-3 tests. New file: `lib/auth/roles.ts`.

**Sequencing.** Add `lib/auth/roles.ts` first → wire imports site-by-site → delete literals → run `tsc --noEmit` and `npm run lint`.

**Exit criteria.**
- `grep -r "request-manager\|senior-reviewer\|final-approver"` returns only test fixtures (cleaned in Phase 10).
- `tsc --noEmit` clean for auth files.
- `lib/auth/__tests__/authorize.test.ts` passes.

**Rollback.** Per-commit revert; auth changes are local to a small set of files.

**Effort.** 1–2 person-days.

**Dependencies.** Phase 2 (schema must already drop `Department` + `Case.departments[]`).

---

## Phase 4 — Workflow simplification

**Goal.** Strip the 6-stage milestone pipeline, drag-drop role-gated assignment UI, SCIM provisioning, and dept-based queries. Reshape `recomputeCaseStatus` → `recomputeBatchStatus` for the 3-stage flow.

**Scope.**

*Files deleted entirely.*
- `lib/data/pipeline.ts` (whole file — entirely milestone-centric per survey Q1).
- `lib/actions/pipeline-actions.ts` (`initializePipeline`, `savePipeline`).
- `app/requests/[id]/pipeline/page.tsx` and `pipeline-client.tsx` (drag-drop assignment UI).
- `app/api/scim/Users/route.ts`, `app/api/scim/Users/[id]/route.ts`, `app/api/scim/Groups/route.ts`, `app/api/scim/Groups/[id]/route.ts` (whole `/api/scim/` directory).
- `lib/actions/department-actions.ts`.
- `app/admin/departments/` (any pages — to verify; if absent, dept CRUD lived inside Settings).
- `e2e/api/scim.spec.ts`.

*Files heavily edited.*
- `lib/data/cases.ts` → renamed `lib/data/batches.ts`. The state machine in `recomputeCaseStatus()` (cases.ts:92-137) → `recomputeBatchStatus()`. New status set: `draft | processing | ready-for-review | reviewed | exported | deleted`. Rules:
  - any document `pending|processing` → batch `processing`
  - all documents `ready` and none `in-review|reviewed|signed-off` → batch `ready-for-review`
  - all documents `signed-off` → batch `reviewed`
  - any export job complete → batch `exported`
- `lib/data/cases.ts:46-57` (`getNextReference`) → returns `BATCH-YYYY-NNN`.
- `lib/actions/case-actions.ts` → `lib/actions/batch-actions.ts`. `createCase()` → `createBatch()`; drops `departments[]`, `requesterType`, `dateReceived`, `deadline`, `priority` (move to optional metadata if requested in REQ matrix; otherwise drop). `extendDeadline()` deleted (LGOIMA s14). `createBatch()` now requires a `name` argument; the batches-list and batch-detail UIs display `name` as the primary identifier with `reference` as a secondary code.
- All `app/requests/` routes → renamed `app/batches/`. Sidebar nav (`components/layout/sidebar.tsx`) updated.
- `app/admin/settings/settings-client.tsx` → drop the **Workflow** and **Departments** sub-sections from the Organisation tab; drop the **Integrations** tab.
- `lib/actions/settings-actions.ts:13-50` → drop `saveWorkflowConfig`, `saveLGOIMAWarningThresholds`.
- `lib/data/settings.ts:8-23` → drop `WORKFLOW_CONFIG`, `LGOIMA_CONFIG`, `ORG_OMBUDSMAN` from `SETTING_KEYS`. Drop the `OrgOmbudsman` interface (208-236).
- `lib/data/org-config.ts` → drop `getOrgOmbudsman()` and callers.
- `app/api/documents/queue-status/route.ts` — review whether queue concept survives without `ProcessingJob`. If used for in-flight feedback, replace with a polling read of `Document.status`.

*Audit hash chain.* The chain is per-batch (was per-case). Hash payload at `lib/data/audit.ts:48-56` includes `caseId` literally — rename to `batchId` in the joined string. Since `0001_init` wipes prior data, no backfill is needed; new hashes compute over the new field name from inception.

*Notification event types.* `lib/data/audit.ts:156-185` `NOTIFICATION_EVENT_TYPES` array drops the LGOIMA workflow events (`senior-review`, `senior-review-submitted`, `final-approval`, `request-changes`). New set: `batch-created`, `document-uploaded`, `processing-complete`, `processing-error`, `review-submitted`, `signed-off`, `export-generated`, `document-assigned`.

**Out of scope.** Setup wizard (Phase 8). Custom rules (Phase 8). Detection rename (Phase 5).

**Files touched.** ~15 source files modified, ~10 deleted.

**Sequencing.**
1. Delete files first (`/api/scim/`, `pipeline.ts`, etc.).
2. Rename `cases → batches` in data + actions + routes (file + symbol rename).
3. Rewrite `recomputeBatchStatus()`.
4. Update sidebar nav and route imports.
5. Strip ombudsman + departments from settings UI.
6. Run `tsc --noEmit` and fix imports.

**Exit criteria.**
- `npm run lint` and `tsc --noEmit` clean.
- Vitest passes for non-deleted unit tests (some will need rename — handled in Phase 10).
- `npm run dev` boots; `/batches` lists batches; create-batch flow works manually.
- `grep -r "case_assignments\|case_milestones\|getCasePipeline\|departments"` returns zero in source code (excluding survey docs).

**Rollback.** Each rename + deletion is a separate commit; revert in stack order. Database is fresh-start so rollback to schema state is `migrate reset`.

**Effort.** 2–3 person-days.

**Dependencies.** Phase 2 (schema), Phase 3 (auth).

### Phase 4 retrospective (executed split: 4a / 4b-i / 4b-ii)

Phase 4 was split into three sub-phases during execution. Final shape:

- **Phase 4a**: Deletions + settings strip (commits ce27dab, 9f61200, a2d768c). 14 file deletions, 5 file edits, 3,751 lines removed. Removed SCIM endpoints, pipeline UI, department-actions, and the Workflow/Departments/Integrations settings tabs.
- **Phase 4b-i**: Lib layer Case→Batch + recomputeBatchStatus + audit chain (commits bd6338d, f8963b0, a5b93da). Schema amendment dropped seven LGOIMA scalars from Batch (regenerated 0001_init). Renamed lib/data/cases.ts→batches.ts and lib/actions/case-actions.ts→batch-actions.ts. Audit hash payload now uses batchId; notification events Umbra-flavoured.
- **Phase 4b-ii**: App routes Case→Batch (commits 60770f2, 6978d11, 4557227, 60b0524, de5d77e). Renamed app/requests/→app/batches/, e2e/cases/→e2e/batches/, dynamic params [requestId]→[batchId]. Updated CaseData→BatchData interfaces. Dropped the deprecated authorizeForCase alias. Cleaned orphan files (lib/data/departments.ts, lib/data/snapshots.ts, lib/actions/profile-actions.ts) that referenced dropped Phase 2 models.

Net TS error reduction across Phase 4: 369 → 223 (cleared 146 errors). All remaining errors in known later-phase debt categories (Phase 5/6/7/8/9).

Cross-cutting work alongside Phase 4 (not part of any single sub-phase):

- **Dev DB split**: Discovered that Veil and Umbra were sharing the same Postgres database, contaminating each other's schemas. Veil-side CC created a separate `umbra` database + user; Umbra-side CC updated DATABASE_URL and re-ran migrations against the new DB. Veil's branch protection on `clarivus_veil` main caught a force-push near-miss earlier in the session.
- **.env hygiene**: Umbra .env was a byte-identical copy of Veil's, which exposed Veil's prod credentials. Cleared AZURE_STORAGE_CONNECTION_STRING, AZURE_AD_*, AZURE_OPENAI_*_SPIKE; regenerated AUTH_SECRET; preserved shared AZURE_OPENAI/AZURE_DI for now (separate in Phase 11).
- **GitHub Actions disabled**: Inherited Veil-era CI/Docker workflows were failing on every push (no Azure secrets configured). Moved .github/workflows/ to .github/workflows-disabled/ pending Phase 11 rebuild.
- **CREATEDB privilege**: Phase 4b-i's `prisma migrate dev` needed shadow-DB creation privilege. Granted via `ALTER USER umbra CREATEDB` from the veil superuser.

Lessons recorded for future phases:

- **Force-push discipline**: Always verify `git remote -v` before any `git push --force`. Branch protection on production repos is non-negotiable safety infrastructure.
- **Plan Mode collapse**: Claude Code's Plan Mode can collapse multi-edit tasks into a single "write to disk" action without applying intermediate amendments. For amendment-style work, prompt explicitly with "Do NOT enter Plan Mode; execute via Edit tool".
- **Cross-session DB awareness**: When two CC sessions work in adjacent directories, they may share infrastructure (DB, secrets) without realising. Audit shared resources early in any fork.

---

## Inter-phase housekeeping

### Pre-Phase-5: npm audit triage

The Veil-fork inheritance brought 27 npm vulnerabilities (1 critical, 13 high, 12 moderate, 1 low). Most are deep transitive deps. Recommended task before starting Phase 5:

1. Run `npm audit` and review the list.
2. Apply `npm audit fix` for non-breaking patches.
3. For breaking changes (`npm audit fix --force`), review impact on the dependency graph before applying — some Veil-era deps may be removable in Phase 7 (cover-letter/cost-recovery deletions) or Phase 9 (seed rewrite).
4. Document residual vulnerabilities (those requiring upstream fixes) in a `SECURITY-NOTES.md` for visibility.

Effort: 0.5 person-day.

---

## Phase 5 — Detection-type rename + parity test

**Goal.** Rename `driver-licence` → `nz-driver-licence` everywhere AND clean up the call sites for the three Detection fields dropped in Phase 2 (`suggestedGround`, `appliedGround`, `piConsideration`). The latter wasn't enumerated in the original Phase 5 scope but emerged during Phase 4b-i verification — ~95 TS errors across `lib/actions/detection-actions.ts` (39), `lib/data/qa-simulation.ts` (11), `lib/actions/manual-detection-actions.ts` (11), `lib/data/detections.ts` (10), `lib/pipeline/version-snapshot.ts` (5), and smaller satellites. Add a parity test that locks the detection-type list to the validation vocabulary, eliminating the silent-failure risk flagged in survey Q3 / Q10.

**Scope.**

*Sites to update (rename + count stays at 22):*
- `lib/detection-type-grounds.ts:17` — map key.
- `lib/pipeline/patterns.ts:151-160` — `driver-licence` regex pattern's `type` field.
- `lib/pipeline/ai-detect.ts:351-353` — worked example referencing `driver-licence`.
- `lib/data/settings.ts:80, 103` — toggle label key + UI map.
- `prisma/seed.ts`, `prisma/seed-extra-docs.ts`, `scripts/seed-content.ts` — fixture detection rows (will be largely rewritten in Phase 9 anyway).
- `e2e/fixtures/test-data.ts` — fixture rows.
- `lib/__tests__/detection-type-grounds.test.ts:53` — count assertion stays at 22 (it was always 22; survey clarified this).
- `lib/pipeline/__tests__/patterns.test.ts` — context-word discrimination cases for `nz-driver-licence` vs `nz-passport`.
- `lib/pipeline/__tests__/canonical-pdf.integration.test.ts` — `HM847219` driver-licence assertion.

*Note on grounds.* The `DEFAULT_GROUND_FOR_TYPE` map is being repurposed in Phase 7 (export). For Phase 5, we keep the structure — the LGOIMA ground codes get replaced with Umbra category codes in Phase 7. The rename of the type key is independent of the codomain rework.

*Detection field call-site cleanup.* The fields `suggestedGround`, `appliedGround`, and `piConsideration` were dropped from the Detection model in Phase 2's schema reboot, replaced by a single `note: String?`. Phase 5 cleans up the call sites:
- `lib/actions/detection-actions.ts` (~39 errors): remove all reads/writes of the three dropped fields. Where reviewer rationale is being captured, write to `note` instead.
- `lib/actions/manual-detection-actions.ts` (~11 errors): same.
- `lib/data/detections.ts` (~10 errors): drop the fields from select/include shapes and from any `DetectionInput` types.
- `lib/data/qa-simulation.ts` (~11 errors): adapt simulation harness to the simplified Detection shape.
- `lib/pipeline/version-snapshot.ts` (~5 errors): adjust snapshot serialisation to drop the three fields.
- Any other satellites surfaced during work.

*Parity test (new).* Add `lib/__tests__/detection-type-parity.test.ts`:

```ts
// Pseudocode
import { DEFAULT_GROUND_FOR_TYPE } from "@/lib/detection-type-grounds";
import { DETECTION_TYPE_MAP, DEFAULT_DETECTION_TOGGLES } from "@/lib/data/settings";
import { ALL_AI_TYPES } from "@/lib/pipeline/ai-detect";
import { PATTERNS } from "@/lib/pipeline/patterns";

it("every detection type appears in every plumbing point", () => {
  const allTypes = new Set(Object.keys(DEFAULT_GROUND_FOR_TYPE));
  // toggle map covers all types
  Object.values(DETECTION_TYPE_MAP).forEach(t => expect(allTypes.has(t)).toBe(true));
  DEFAULT_DETECTION_TOGGLES.forEach(t => expect(allTypes.has(t.type)).toBe(true));
  // every regex pattern emits a known type
  PATTERNS.forEach(p => expect(allTypes.has(p.type)).toBe(true));
  // every AI type is a known type
  ALL_AI_TYPES.forEach(t => expect(allTypes.has(t)).toBe(true));
});
```

**Out of scope.** Replacing LGOIMA ground codes (Phase 7). Removing `suggestedGround` column (already in Phase 2 schema).

**Files touched.** ~8 source/fixture files + 1 new test.

**Sequencing.**
1. New parity test (verify it currently *fails* against legacy `driver-licence` → not really a failure, just a sanity check; or commit failing first then green after rename).
2. Sed-style rename across the 8 files.
3. Run unit tests.

**Exit criteria.**
- `grep -rn "driver-licence" --include='*.ts'` returns zero hits in source (survey/plan docs OK).
- New parity test passes.
- `lib/__tests__/detection-type-grounds.test.ts:53` count assertion still 22.

**Rollback.** Single revert.

**Effort.** 1.5–2 person-days.

**Dependencies.** None hard — can be done in parallel with Phase 3-4 if desired. Plan ordering keeps it after the workflow rework so test fixtures only churn once.

---

## Phase 6 — Retention + Purge (largest greenfield)

**Goal.** Build the retention/purge subsystem from scratch. Soft-delete a batch on user action; auto-archive its audit chain to long-term blob storage when the grace expires; hard-delete + cascade afterwards. Admin "Purge Now" with grace-respect or skip-grace-with-confirm.

**Scope.**

*Carry-over from Phase 4b: lib/queue/job-queue.ts disposition.* The file references the dropped `ProcessingJob` Prisma model (15 TS errors). Phase 6's pg-boss introduction is the natural decision point. Choose: (a) delete the file outright if pg-boss replaces all its functionality, or (b) refactor to consume pg-boss's job table and keep any unique helpers. Likely (a) — the file's functionality (queue UI for processing jobs) is being subsumed by both the simpler workflow (no explicit processing queue) and pg-boss (background job scheduling).

*Scheduled-job runner (new).* Recommended: add `pg-boss` (Postgres-backed job queue, no external infra, survives restarts, schema co-located in our DB). Alternatives flagged in Open Questions.

- New dependency: `pg-boss` (~5MB, MIT, mature).
- New file `lib/jobs/runner.ts` exporting `boss` instance + `startWorker()`.
- Worker integration: instantiate boss in a long-running mode within the Next.js server (one of: instrumentation hook in `instrumentation.ts`, or a separate process invoked via `npm run worker`). For App Service B1, in-process is fine; if we need a dedicated worker container later, the same code moves.
- Cron registration: `boss.schedule("retention-sweep", "0 * * * *", {}, { tz: "Pacific/Auckland" })` — hourly sweep.

*Soft-delete UX.*
- New action `lib/actions/batch-actions.ts:softDeleteBatch(batchId)` — sets `deletedAt = now()`, `purgeScheduledAt = now() + retentionGraceDays`. Audit-trails the action.
- Active-list queries (`getBatches`, `getBatch`) filter `deletedAt: null` by default; admin "Trash" view shows `deletedAt: { not: null }, purgedAt: null`.
- New action `restoreBatch(batchId)` — admin only; clears `deletedAt`, `purgeScheduledAt`. Audit-trail.
- New action `purgeNowBatch(batchId, { skipGrace?: boolean, reason?: string })` — admin only. When `skipGrace = true`, `reason` is required (non-empty). The reason is recorded in the audit-trail entry and copied to the `PurgeLog` row. The confirm dialog UI surfaces a required textarea before the destructive button enables.

*Retention worker.* New file `lib/jobs/retention-sweep.ts`:
1. Find batches where `purgeScheduledAt <= now() AND purgedAt IS NULL`.
2. For each, archive its audit chain to long-term blob storage (see below).
3. Verify the archive (re-read, integrity check).
4. Hard-delete the Batch row — cascades through Document → Detection/DetectionHistory/AuditEntry/ExportJob/FileUpload (Phase 2 cascades).
5. Best-effort blob cleanup: list blobs under prefix `{batchId}/` and call `storage.delete()` for each.
6. Set `purgedAt = now()` on a small "purge log" row — but if we hard-delete the Batch, there's no row left. So either: (a) keep a separate `PurgeLog` model that survives the cascade, or (b) accept that audit of the purge lives only in the archive blob's filename / a tombstone audit entry written before deletion.

*Audit-archive format.* Layout:
- `archives/{YYYY}/{batchId}/audit.jsonl` — canonical JSON-Lines, one entry per line, byte-exact serialisation matching the integrity-hash payload. Source of truth for hash re-verification.
- `archives/{YYYY}/{batchId}/audit.csv` — RFC-4180 CSV mirror for human/spreadsheet consumption. Lossy and not used for verification.
- `archives/{YYYY}/{batchId}/integrity.json` — `{ batchId, totalEntries, chainValid: boolean, brokenAt?: number, sha256OfJsonl: string, archivedAt }`.
- `archives/{YYYY}/{batchId}/manifest.json` — batch metadata (`ref`, `name`, `createdAt`, `deletedAt`, `purgedAt`, `documentCount`, `detectionCount`).

*Auto-retention default (REQ-015).* New `RETENTION_CONFIG` setting key in `lib/data/settings.ts`:
```ts
{ retentionDaysAfterCompletion: 14, gracePeriodDays: 7, autoRetentionEnabled: true }
```
Worker also sweeps non-deleted batches whose status is `exported` and whose `updatedAt` is past `retentionDaysAfterCompletion`, soft-deleting them with a system-user audit trail entry.

*Admin UI.*
- New admin page `app/admin/retention/page.tsx` + client. Shows: retention config form, soft-deleted batches table (Trash), purge history log (read from archive blob index or a `PurgeLog` model).
- Per-batch "Delete" button on the batches list (admin only). Confirm dialog.
- Per-batch "Restore" + "Purge Now" buttons in the Trash view.
- Cross-batch audit log download (REQ — implied; not yet present): Settings → Backup tab → "Download audit archive (all batches)" — returns a ZIP of all archived audit JSONLs + CSVs + integrity JSONs from `archives/` blob path.

*Concurrency.* The retention worker claims a batch via `SELECT ... FOR UPDATE SKIP LOCKED` filtered on `deletedAt IS NOT NULL AND purgeScheduledAt <= now() AND purgeStatus IS NULL`, immediately updates `purgeStatus = "purging"`, then proceeds with archive + cascade. Restore and Purge-Now actions check `purgeStatus IS NULL` before mutating. This prevents two workers double-processing the same batch and stops admins restoring a batch mid-purge.

*PurgeLog model (new, recommended in addition to archive blob).* Survives Batch deletion; lets us show a history table without parsing blob index.

```prisma
model PurgeLog {
  id           String   @id @default(cuid())
  batchId      String   // reference, no FK (batch is deleted)
  batchRef     String   // e.g. "BATCH-2026-014"
  archivePath  String   // blob path
  totalEntries Int
  chainValid   Boolean
  archivedBy   String   // userId or "system"
  archivedAt   DateTime @default(now())
  @@index([archivedAt])
  @@map("purge_log")
}
```

**Out of scope.** Cross-batch audit aggregation UI beyond the simple archive-ZIP download (full UI is a v2 nice-to-have).

**Files touched.** New: `lib/jobs/runner.ts`, `lib/jobs/retention-sweep.ts`, `lib/actions/batch-purge-actions.ts`, `app/admin/retention/page.tsx` + client. Modified: `prisma/schema.prisma` (add `PurgeLog`, soft-delete columns already in Phase 2), `lib/actions/batch-actions.ts`, `lib/data/batches.ts`, `lib/data/settings.ts`, `app/admin/settings/settings-client.tsx` (Backup tab wiring), `instrumentation.ts` (worker startup), `package.json` (`pg-boss` dependency, optional `npm run worker` script).

**Sequencing.**
1. Add `PurgeLog` model + migration extension to `0001_init` (still pre-deploy, so legal to amend).
2. Add `pg-boss` dependency.
3. Build `lib/jobs/runner.ts` + smoke-test job.
4. Implement soft-delete actions + UI buttons.
5. Implement retention-sweep worker.
6. Implement audit-archive output + verify roundtrip (write JSONL → re-parse → recompute first/last hash → match `integrity.json.sha256OfJsonl`; also write CSV mirror).
7. Wire admin Retention page.
8. Integration test: create batch → upload doc → soft-delete → wait → verify cascade + blob cleanup + archive presence.

**Exit criteria.**
- pg-boss worker starts on `npm run dev`; visible in DB as `pgboss` schema.
- Soft-delete + restore + purge-now actions all work via admin UI.
- After purge, `prisma.batch.findUnique` returns null; all related rows are gone; blobs under `{batchId}/` are gone; an `archive/{YYYY}/{batchId}/` directory exists in blob storage; `PurgeLog` row is present.
- Auto-retention: a batch with `status = exported` and `updatedAt` aged past `retentionDaysAfterCompletion` is soft-deleted on the next sweep.
- New unit tests for `retention-sweep.ts` pass; new e2e test `e2e/admin/retention.spec.ts` passes.

**Rollback.** Removing pg-boss is straightforward (no schema lock-in beyond its own `pgboss` schema, which can be dropped). Soft-delete columns are nullable; reverting the worker leaves them as inert columns.

**Effort.** **4–6 person-days.** Largest greenfield phase. Watch out: blob-cleanup paging at scale, audit-chain integrity verification across the archive boundary, race conditions between the worker and concurrent admin actions on the same batch (use row-level lock or a status flag).

**Dependencies.** Phase 2 (soft-delete columns + cascades), Phase 3 (admin role), Phase 4 (batch-actions module exists).

---

## Phase 7 — Export simplification

**Goal.** Single ZIP package: redacted PDFs + audit log (CSV + PDF). Drop LGOIMA-specific generators. Reframe schedule + chain-of-custody.

**Scope.**

*Files deleted.*
- `lib/pipeline/cover-letter.ts`.
- `lib/pipeline/cost-recovery-report.ts`.
- `lib/pipeline/compliance-summary-report.ts`.
- `lib/pipeline/reviewer-workload-report.ts`.
- `app/api/reports/compliance-summary/route.ts`, `app/api/reports/cost-recovery/route.ts`, `app/api/reports/reviewer-workload/route.ts`, `app/api/reports/withholding-schedule/route.ts`. Keep: `chain-of-custody`, `ai-accuracy`.
- `app/api/schedule/[requestId]/route.ts` — schedule API (LGOIMA-specific). The schedule-as-PDF concept survives but is generated as part of the export only.
- `e2e/cases/schedule.spec.ts`, `e2e/export/export-actions.spec.ts`, `e2e/export/export-package.spec.ts`, `e2e/api/export.spec.ts`, `e2e/reports/reports.spec.ts`.

*Files reframed.*
- `lib/pipeline/schedule.ts` — regroup detections by **detection type** (not LGOIMA ground). Output a "redaction schedule" PDF listing: page reference, line/region locator, detection type, count per type per page, optional reviewer note. **Never includes the redacted text itself, even masked** — schedules are circulated artefacts and any leakage of the underlying values defeats the redaction. Rename file to `lib/pipeline/redaction-schedule.ts`.
- `lib/pipeline/chain-of-custody.ts` — drop the line-8 "satisfies LGOIMA chain-of-custody requirements" comment. Rename to `lib/pipeline/audit-timeline.ts`.
- `lib/pipeline/audit-pdf.ts` — keep; rename remains. The integrity-hash badge visualization is generic.
- `lib/pipeline/export.ts` — `PackageType` union collapses to a single value (or remove the parameter entirely). Drop `cover-letter` / `cost-recovery` / `compliance-summary` / `reviewer-workload` builders from the orchestration. ZIP layout: `redacted/{originalFilename}.pdf` for each, plus `redaction-schedule.pdf`, `audit-timeline.pdf`, `audit-log.csv`, `audit-log.pdf`, `manifest.json`.

*ExportJob disposition* (Open Question #4): recommend KEEP the model but drop `packageType`, `batchGroupId`, `batchNumber`, `documentIds` if multi-doc batching simplifies. Wait for reviewer answer before final commit.

*Helpers preserved.*
- `lib/pipeline/logo-helper.ts` — keep.
- `lib/pipeline/pdf-fonts.ts` — keep (Noto Sans + macron support).
- `lib/pipeline/sanitise-metadata.ts` — keep.
- `assembleZip()` (currently `lib/pipeline/export.ts:644-658`) — extract to `lib/pipeline/zip.ts` for reuse by the audit-archive (Phase 6).
- 3-tier redaction engine (`lib/pipeline/redact-pdf.ts` + Python sidecars) — KEEP unchanged.

*Routes / UI.*
- `app/api/export/[requestId]/generate/route.ts` → `app/api/export/[batchId]/generate/route.ts`. Drop `packageType` query param.
- `app/requests/[id]/export/export-client.tsx` → `app/batches/[id]/export/export-client.tsx`. Drop the package-picker; show a single-button export with checkbox list of documents.

**Out of scope.** Custom rules + AI governance pages (Phase 8).

**Files touched.** ~10 source files modified, ~7 deleted.

**Sequencing.**
1. Delete LGOIMA-specific generators + routes + e2e tests.
2. Refactor `export.ts` to remove package-type branches.
3. Rename `schedule.ts → redaction-schedule.ts` and regroup-by-type.
4. Rename `chain-of-custody.ts → audit-timeline.ts`, drop LGOIMA framing.
5. Extract `assembleZip()` to `lib/pipeline/zip.ts`.
6. Update UI client.
7. Update `e2e/export/` to a single new spec covering the simplified flow.

**Exit criteria.**
- `grep -r "ombudsman\|cover-letter\|cost-recovery\|compliance-summary\|reviewer-workload"` zero hits in source.
- One end-to-end export produces a ZIP with the new layout.
- New e2e `e2e/export/export-zip.spec.ts` passes.

**Rollback.** Per-commit revert.

**Effort.** 1–2 person-days.

**Dependencies.** Phase 2 (Batch rename), Phase 4 (route renames), Phase 5 (detection types finalized for `redaction-schedule.ts`).

---

## Phase 8 — Setup wizard + admin UI updates

**Goal.** Slim 7→5-step wizard. Wire admin UI for retention + 2-role world. Decide custom-rules / AI-governance disposition.

**Scope.**

*Wizard.*
- `app/setup/setup-wizard-client.tsx` — drop Step 1 "Departments & Teams" and Step 3 "LGOIMA Workflow"; remove Ombudsman block from Step 2 "Document Branding". Re-number remaining steps 0..4: Org Identity, Document Branding (no ombudsman), Detection Policies, Team Setup (2-role dropdown), Review.
- `lib/actions/setup-actions.ts` — drop `saveLGOIMAConfig`; simplify `saveOrgBranding` to remove ombudsman fields.
- Setup-wizard state persistence stays on `system_settings.setup_wizard_state`.

*Admin Settings page.*
- `app/admin/settings/settings-client.tsx`:
  - Organisation tab: drop Departments sub-section; collapse role dropdown to 2.
  - Drop Workflow tab.
  - Drop Integrations tab.
  - Backup tab: wire to retention config from Phase 6; surface scheduled-job status, last-archive timestamp, current Trash count, cross-batch audit ZIP download.
  - Detection tab: 22 toggles (no LGOIMA grouping).
  - System Health tab: keep.
- `lib/data/settings.ts:8-23` `SETTING_KEYS`: drop `WORKFLOW_CONFIG`, `LGOIMA_CONFIG`, `ORG_OMBUDSMAN`; add `RETENTION_CONFIG` (Phase 6).

*Custom rules (Open Question #1).* Recommendation: ADAPT, not delete.
- Drop `suggestedGround` column from `CustomRule` (already in Phase 2 schema reboot).
- Add `note: String?` (free-form; reviewers see this when a rule fires).
- Update `app/admin/rules/rules-client.tsx` to drop the ground dropdown; add a "Note" textarea.
- Update `lib/actions/rule-actions.ts` to accept `note` instead of `suggestedGround`.

*AI governance.* Keep as-is structurally; verify the metrics it reports still make sense post-rename. The `lib/data/ai-metrics.ts` aggregations are detection-type/status-based; should survive the type rename (Phase 5) without edits beyond the type-string change.

**Out of scope.** Branding text sweep (Phase 9).

**Files touched.** ~10 source files modified.

**Sequencing.**
1. Setup wizard — drop steps, re-number, drop ombudsman + LGOIMA.
2. Settings — drop tabs, collapse role dropdown, wire retention config.
3. Custom rules — drop ground field, add note field.
4. Run lint + tsc; run the wizard end-to-end manually.

**Exit criteria.**
- `npm run dev` → `/setup` shows 5 steps; completing all 5 sets `completedAt`.
- Admin settings page renders without missing-tab errors; retention controls visible and editable.
- Custom rule create/edit form works without `suggestedGround`.
- `e2e/setup/setup-wizard.spec.ts` updated and passing.

**Rollback.** Per-commit.

**Effort.** 1–2 person-days.

**Dependencies.** Phase 2 (`SystemSetting` rebuild), Phase 3 (role dropdown), Phase 6 (retention config wiring).

---

## Phase 9 — Branding + docs cleanup

**Goal.** Eradicate `Veil`, `Clarivus`, `LGOIMA`, `OIA`, `ombudsman`, `Council`/`Palmerston`/`PNCC` from source code, UI strings, public-facing docs, and seed data. Replace with Umbra branding and a generic NZ-council seed scenario.

**Scope.**

*Documentation.*
- Refresh `README.md` — Umbra positioning, NZ public-sector audience (councils and agencies), simpler workflow description.
- Refresh `CLAUDE.md` — Quick Reference table, role list (admin/reviewer), batch model, retention/purge mention, drop LGOIMA grounds, drop SCIM, drop departments, drop multi-stage milestone.
- Refresh `DEVELOPER-NOTES.md`, `CHANGELOG.md` — record the fork transition.
- New doc `docs/architecture/01-umbra-overview.md` — replaces the multi-doc Veil architecture set or supplements it.
- Move all `docs/lgoima-*.md`, `docs/lgoima-act-2026-01-15.pdf`, `docs/spike-harassment-risk-2026-04-23/`, `docs/architecture/06-integration-architecture.md` (LGOIMA-keyed reports) into `docs/legacy-veil/` for historical reference. Or delete (Open Question #6).
- Refresh or replace `docs/requirements-traceability.md` with Umbra REQ-keyed mapping.
- Refresh / write `DEMO-SCRIPT` and `PRODUCT-FEATURES` docs (mentioned by user; verify presence).

*Seed data.*
- `prisma/seed.ts` — replace 11 PNCC users + 8 departments + 5 LGOIMA cases with: 1 admin user + 2–3 reviewer users + 3 sample Batches with plausible `name` values. Use "Ministry of Demo" (an agency, not a council) as the seed organisation.
- `prisma/seed-extra-docs.ts` — generic extra docs; drop PNCC-specific names.
- `scripts/seed-content.ts` — generic content.
- `e2e/fixtures/test-data.ts` — generic fixtures.

*Source-code string sweep.*
- Grep targets: `Veil`, `Clarivus`, `LGOIMA`, `OIA`, `ombudsman`, `Office of the Ombudsman`, `Local Government`, `disclosure`, `withholding`, `Palmerston`, `PNCC`, `request-manager`, `senior-reviewer`, `final-approver`, `request`/`requester` (when used as case-relationship terminology — keep when neutral), `cover-letter`, `chain-of-custody` (handled in Phase 7), `cost-recovery`.
- UI labels: `app/**/*.tsx`, `components/**/*.tsx`. Replace "Cases" → "Batches", "Request" → "Batch" or omit, "Review Queue" → keep, "Disclosure" → "Redaction".
- Where copy says "council" or "council officer" without good reason, broaden to "council or agency" / "reviewer".
- Email templates: `lib/email/templates.ts:24-58` invitation email — replace "Veil" with "Umbra".
- App layout title (already touched in Phase 1): "Veil" → "Umbra" (final).

*Visual branding.*
- Logo file swap (location TBD — Phase 0 confirms asset readiness).
- Favicon swap.
- Color palette / Tailwind config update if Umbra has distinct brand colors.
- App-Shell branding header.

*App naming.*
- `prisma.config.ts`, `docker-compose.yml` — DB name change `veil` → `umbra` (this means a fresh `db:reset`).
- Default `DATABASE_URL` in `.env.example`: `postgresql://umbra:umbra_dev@localhost:5434/umbra`.

**Out of scope.** Test content rewrites (handled in Phase 10).

**Files touched.** Wide — estimate 50-80 files (most one-line edits). Plus 2-3 deleted/archived doc files. Plus 5-10 actual content rewrites for seed + key docs.

**Sequencing.**
1. Docs refresh first (README, CLAUDE, DEVELOPER-NOTES, CHANGELOG). These guide the rest.
2. Seed data rewrite.
3. UI string sweep — grep + manual review per file.
4. Email templates.
5. Visual assets.
6. DB name change last (forces reset).

**Exit criteria.**
- `grep -rni "veil\|clarivus\|lgoima\|ombudsman\|pncc\|palmerston" --include='*.{ts,tsx,md,json}'` returns only `docs/legacy-veil/`, survey, plan, and changelog history entries.
- New seed runs cleanly against fresh DB.
- `npm run build` succeeds; manual smoke of homepage shows Umbra branding.

**Rollback.** Per-file. The most disruptive change is the DB name; revertible via env var.

**Effort.** 1–2 person-days.

**Dependencies.** Phases 2, 3, 4, 7, 8 (so the underlying terminology is stable before mass rename).

---

## Phase 10 — Test triage

**Goal.** Restore a green test suite. Per the survey verdicts (Q8): port keepers, rewrite LGOIMA-specifics, add net-new tests for retention/purge/parity (already in Phases 5 + 6).

**Scope.**

*Tests deleted.*
- `lib/__tests__/lgoima-grounds.test.ts`.
- `lib/__tests__/detection-type-grounds.test.ts` — replaced by the parity test (Phase 5) plus a small lookup test.
- `lib/pipeline/__tests__/schedule.test.ts` — replaced by a `redaction-schedule.test.ts`.
- `e2e/cases/schedule.spec.ts`, `e2e/export/export-actions.spec.ts`, `e2e/export/export-package.spec.ts`, `e2e/api/export.spec.ts`, `e2e/reports/reports.spec.ts`, `e2e/api/scim.spec.ts`.

*Tests modified (per survey Q8 verdicts).*
- `lib/auth/__tests__/authorize.test.ts` — 2-role world.
- `lib/actions/__tests__/extend-deadline.test.ts` — delete (LGOIMA s14 gone).
- `lib/actions/__tests__/bulk-accept-detections.test.ts` — should survive; verify after type rename.
- `lib/validation/__tests__/schemas.test.ts` — drop LGOIMA-ground vocabulary tests.
- All `e2e/cases/*` → renamed to `e2e/batches/*`; status-machine e2es updated to 3-stage flow.
- `e2e/auth/rbac.spec.ts` — 2-role matrix.
- `e2e/admin/workflow-settings.spec.ts` — delete or rewrite for the slim BatchMilestone display.
- `e2e/admin/integrations.spec.ts` — delete (Integrations tab removed).
- `e2e/admin/notification-settings.spec.ts` — verify; should survive.
- `e2e/setup/setup-wizard.spec.ts` — 5-step flow.

*Tests added.*
- `lib/__tests__/detection-type-parity.test.ts` (Phase 5 — already counted).
- `lib/jobs/__tests__/retention-sweep.test.ts`.
- `lib/actions/__tests__/batch-purge-actions.test.ts`.
- `e2e/admin/retention.spec.ts`.
- `e2e/export/export-zip.spec.ts`.

**Out of scope.** Chasing Phase 11 deployment-environment tests.

**Files touched.** ~10 deleted, ~15 modified, 5 new.

**Sequencing.**
1. Delete obsolete tests first.
2. Rewrite role / status tests.
3. Rename `e2e/cases/* → e2e/batches/*`.
4. Add new tests for retention + export.
5. Run `npm run test` and `npm run test:e2e` until both green.

**Exit criteria.**
- `npm run test` green.
- `npm run test:e2e` green.
- Coverage on retention worker ≥ unit-test happy path + 1 edge (verify failure rolls back).

**Rollback.** Per-test commit.

**Effort.** 2–3 person-days.

**Dependencies.** All preceding phases must be code-complete.

---

## Phase 11 — Azure Australia East infra

**Goal.** Provision a clean Azure environment for Umbra deployment. Adjust based on the Phase 0 region check.

**Scope.**

*Pre-deploy verification.*
- Confirm GA status of: Azure OpenAI (gpt-4o), Azure AI Document Intelligence (`prebuilt-read`), App Service Linux B1, PostgreSQL Flexible Server, Blob Storage, Key Vault, ACR — all in Australia East.

*Resource group.*
- New RG `rg-umbra-prototype` (Australia East).
- ACR `acrumbraprototype` (Australia East).
- App Service Plan B1 + Web App `app-umbra-prototype`.
- PostgreSQL Flexible Server `psql-umbra-prototype` with admin secret in Key Vault.
- Storage Account `stumbraprototype` with containers `documents`, `archives` (audit archive from Phase 6), `backups`.
- Key Vault `kv-umbra-prototype`.
- Application Insights instance.

### Cross-product separation context (precedent set in Phase 4)

Today's DB-split work between Veil and Umbra established a precedent that Phase 11 must extend to production:

- **Database**: Veil and Umbra share the same dev Postgres instance but with separate users (`veil`, `umbra`) and separate databases. For production, Phase 11 must provision a *separate* Azure Postgres Flexible Server for Umbra (`psql-umbra-prototype`) — not a shared instance.
- **Storage**: Umbra dev uses local filesystem fallback (`AZURE_STORAGE_CONNECTION_STRING=""`). Phase 11 must provision a separate Azure Storage Account for Umbra (`stumbraprototype`) with containers `documents`, `archives`, `backups`.
- **Auth**: Umbra dev forces Credentials login (`AZURE_AD_*=""`). Phase 11 must register a separate Azure AD app for Umbra and populate its CLIENT_ID/SECRET/TENANT_ID — never share Veil's app registration.
- **AI services**: Umbra dev currently shares Veil's Azure OpenAI + Document Intelligence deployments (50K TPM bucket). Phase 11 should evaluate whether to provision separate Umbra deployments or continue sharing. Decision factors: TPM contention impact on Veil's bench reliability, separate billing requirements, separate quota management.
- **AUTH_SECRET**: Each Umbra environment must have its own freshly-generated `AUTH_SECRET` (cryptographically distinct from any Veil environment). Don't copy from another deployment.
- **Spike credentials**: The four `AZURE_OPENAI_*_SPIKE` keys were Veil-specific detection-quality experiments. Umbra has no immediate need for them; populate only if Umbra introduces its own spike-comparison endpoints.

*Configuration.*
- App Service env vars: `DATABASE_URL`, `AUTH_SECRET`, `AZURE_OPENAI_*`, `AZURE_DI_*`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_AD_*`, `RETENTION_*` (Phase 6).
- Custom domain placeholder (`umbra.<tbd>.nz`); cert via App Service managed cert or Key Vault.
- App Service "Always On" = true (so the in-process pg-boss worker never sleeps). If we move to a separate worker container, deploy to a 2nd App Service and disable the in-process worker via env var.

*Deploy scripts.*
- New `docs/deployment.md` with the canonical bicep / az-cli sequence.
- Update Dockerfile if needed for pg-boss / worker.
- Update `package.json` with `npm run deploy` convenience target.

*First deploy.*
- Build image: `az acr build --registry acrumbraprototype --image umbra-prototype:cr1 .`
- Deploy: `az webapp config container set ...`
- Run migrations: `DATABASE_URL=... npx prisma migrate deploy`.
- Run seed: `DATABASE_URL=... npx tsx prisma/seed.ts`.
- Smoke-test: log in via SSO, create a batch, upload a doc, run a redaction, export a ZIP, soft-delete the batch.

**Out of scope.** Production hardening (rate-limits, WAF, multi-region failover) — v2.

**Files touched.** New: `docs/deployment.md`, possibly `infra/main.bicep`. Modified: `Dockerfile`, `package.json`, `.env.example`, `CLAUDE.md` (deployment section).

**Sequencing.**
1. Region check (Phase 0 redux — re-verify with current vendor state).
2. Provision resources (script-driven).
3. First deploy + smoke test.
4. Document + close.

**Exit criteria.**
- `https://umbra.<tbd>.nz` loads (or temporary `*.azurewebsites.net`).
- Smoke flow succeeds (login → batch → upload → redact → export → soft-delete → purge).
- Audit archive blob written + verifiable.
- Application Insights receiving telemetry.

**Rollback.** Tear down RG; redeploy from scratch.

**Effort.** 1–2 person-days.

**Dependencies.** All code phases (1-10) complete + green test suite.

### Phase 11 retrospective (executed split: 11a / 11b)

Phase 11 was executed in two slices to keep the long-running provisioning work out of the codebase-prep work:

- **Phase 11a — Code/docs prep for Azure deployment.** Five commits, all merged to main before any cloud work began:
  - `feat(infra): bicep template for Azure Australia East provisioning` — `infra/main.bicep` provisions ACR + App Service Plan B1 + Web App with SystemAssigned managed identity + alwaysOn=true, Postgres Flexible Server B1ms, Storage Account with `documents` / `archives` / `backups` containers, Key Vault in RBAC mode, Azure OpenAI (S0), Document Intelligence (S0), App Insights + Log Analytics. RBAC role assignments grant the Web App identity AcrPull on ACR, Key Vault Secrets User on KV, Storage Blob Data Contributor on Storage; deployer gets Key Vault Administrator. App settings include 8 KV-referenced secrets via `@Microsoft.KeyVault(VaultName=…;SecretName=…)`.
  - `feat(deploy): scripts for provision/build/migrate/smoke` — six shell scripts under `scripts/deploy/` wrapping the canonical Azure CLI flows (provision, build-and-push via `az acr build`, deploy-image, migrate-db, seed, smoke).
  - `docs(deploy): comprehensive deployment guide with cost estimate` — 9-section runbook in `docs/deployment.md`. Cost estimate ~NZ$165/month at the prototype tier.
  - `chore(docker): HEALTHCHECK directive + generalise build-arg comment` — Dockerfile gains a HEALTHCHECK pointing at `/api/health`; Veil-era CI workflow / kv-veil-prototype references generalised.
  - `chore(scripts): npm run deploy:* convenience targets` — `package.json` adds `deploy:provision`, `deploy:build`, `deploy:image`, `deploy:migrate`, `deploy:seed`, `deploy:smoke`, plus aggregate `deploy` chaining build → image → migrate → smoke.

- **Phase 11b — Live provisioning + first deploy.** 18 commits during execution. Highlights:
  - **Subscription split.** Provisioning happened under a fresh subscription `clarivus_umbra` (`ae3a79c2-b434-42cf-aad6-0f18b064add4`) in tenant `f153900b-…`, deliberately separated from `clarivus_veil`. Required CLI cache refresh (`az account list --refresh`) before the new sub became visible.
  - **Provider registration.** Fresh subscription required registering 7 namespaces from `NotRegistered` to `Registered`: `Microsoft.CognitiveServices`, `Microsoft.DBforPostgreSQL`, `Microsoft.ContainerRegistry`, `Microsoft.Storage`, `Microsoft.KeyVault`, `Microsoft.Insights`, `Microsoft.OperationalInsights`. ~6.5 minutes from kick-off to all 8 (incl. pre-registered `Microsoft.Web`) settled at `Registered`. CLI version did not support `--no-wait` on `az provider register` — registration is async by default; the flag was redundant and noisy.
  - **All 11 resources provisioned cleanly** in a single bicep deploy (`umbra-20260503-130842`). The "Failed" deployment that appeared in `az deployment group list` was Azure's auto-created Application Insights "Failure Anomalies" alert rule (a known side-effect on certain SKUs/regions); App Insights itself deployed fine.
  - **Azure AD app registration.** Done out-of-bicep (tenant-scoped). `az ad app create --display-name umbra-prototype --sign-in-audience AzureADMyOrg` → `APP_ID=572f27ea-e39c-44b4-861d-47fca85c6d1e`. 12-month client secret captured to a `mktemp` 600-mode stash file and consumed during Key Vault secret population (never echoed to chat).
  - **9 Key Vault secrets.** 8 populated cross-shell (DATABASE-URL via Eugene's terminal because the password env var lived only there; the other 7 from the agent shell using fetched AOAI/DI keys, the storage connection string, openssl-generated AUTH_SECRET, and the captured AD secret). NEXT-SERVER-ACTIONS-ENCRYPTION-KEY added in a follow-up after all 9 KV references resolved.
  - **Bicep amendment mid-flight.** `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` wasn't in the original bicep app settings; added via a 4-line edit + idempotent re-provision so the canonical bicep stays the source of truth (commit `9d60ea9`).
  - **Middleware fix.** First deploy's `/api/health` returned **HTTP 307 → /login** because `middleware.ts` had no `/api/health` in its public-paths allowlist. One-line fix landed mid-deploy (commit `674ad0b`); rebuild + redeploy returned full JSON with `status: "healthy"`, all 4 backing-service checks (DB / OpenAI / DI / app) reporting OK, both circuit breakers `closed`. This would have been Phase 10 e2e-fixme territory had the screenshot-audit specs been runnable; instead it surfaced at first live curl.
  - **Auth.js v5 provider naming.** AAD app's redirect URI was registered as `/api/auth/callback/azure-ad` per the Block 3 commands, but NextAuth v5's `MicrosoftEntraID` provider sends to `/api/auth/callback/microsoft-entra-id`. First SSO attempt returned AADSTS50011. Two fixes: `az ad app update --web-redirect-uris` to the new path, and `NEXTAUTH_URL=https://app-umbra-prototype.azurewebsites.net` set on the Web App (also persisted in bicep, commit `e0bde02`) so invitation-email links resolve correctly even though `trustHost: true` already handles auth-callback URL discovery from the request Host.
  - **Lockfile regeneration.** First image build failed at `npm ci` with `Missing: @emnapi/runtime@1.10.0 from lock file`. Root cause: macOS-arm64 install didn't fully resolve the wasm32-wasi platform variant of `@napi-rs/wasm-runtime` into the lockfile. Fixed by `rm package-lock.json && npm install` (commit `7d35fe4`); some patch-level drift on transitive deps, package.json unchanged.
  - **Postgres firewall.** Bicep added `AllowAzureServices` (lets the Web App through). Eugene's local Mac IP (`202.189.167.35`) was added at migration time as `eugene-mac-20260503` to allow `prisma migrate deploy` from his laptop.

**Production URL:** https://app-umbra-prototype.azurewebsites.net (Auth.js SSO via Microsoft Entra; resource group `rg-umbra-prototype` in Australia East).

**Cost estimate:** ~NZ$50–75/month at prototype tier (App Service B1 Linux + Postgres Burstable B1ms + Storage Standard LRS + Key Vault Standard + Log Analytics + AOAI/DI pay-per-use). Documented in `docs/deployment.md`.

**Outstanding cleanup items:**

- **`.github/workflows/azure-static-web-apps-blue-bay-…yml`** — auto-pushed by Azure Portal during a brief SWA-experiment commit, fails on every push because the SWA itself was deleted. Should be removed.
- **Postgres firewall rule** `eugene-mac-20260503` — added during 11b for live `prisma migrate deploy` from Eugene's laptop. Can be removed once migrations are routed through a deploy script that runs from inside the Azure perimeter (or kept indefinitely as a developer-laptop allow-list with stricter audit).

**Lessons recorded:**

- **Cross-shell secret handling.** When the agent shell can't see a user-shell env var, the cleanest pattern is a `mktemp` 600-mode stash file scoped to a single bash invocation (used for the AD client secret) — secret stays out of chat history, gets consumed and deleted in the same logical step.
- **Bicep + manual `az` together stays clean** as long as bicep is the source of truth: any one-shot `az` change should be mirrored back into bicep before the next provision run, otherwise re-running provision silently rolls back the manual change. Phase 11b had two such mirrors: `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` app setting and `NEXTAUTH_URL`.
- **App Service `:latest` tag pulls aren't always immediate.** Two restart cycles were sometimes needed for a fresh image to land — the 90-second pull from the build's stop-the-world to "Site started" is the dominant wait. Pin to digest or per-deploy `cr-<sha>` tag if deterministic deploys matter.

---

## Plan-level concerns

### REQ-017 compliance posture

Umbra v1 deploys to Azure Australia East. This is a conscious divergence from REQ-017 ("data processing, storage, and AI inference must occur onshore in New Zealand"). The divergence is to be documented in the deployment guide and surfaced to council/agency customers during procurement. Migration trigger: re-evaluate when Azure OpenAI and Document Intelligence are GA in Azure New Zealand North.

### Critical path / longest pole

Phase 6 (Retention + Purge) is the longest single pole at 4–6 days, and it's a *must-have* (REQ-015 + REQ-016). Phase 2 (Schema reboot) is the blocker for everything in Phases 3-7. Phases 3+4+5 can run partially in parallel after Phase 2 lands. Phase 11 (infra) can be prepped in parallel with Phases 9-10 since it's mostly out-of-tree.

Total expected: **17–28 person-days**, planning around **22-25**. Highest-risk phases reduce to **Phase 6** (largest greenfield) and **Phase 2** (schema-reboot blast radius); the Australia East decision removes the Phase 0/11 region-check binary risk.

### Ordering risks

- **Schema reboot before code rename.** If we reboot the schema first (Phase 2) without renaming `Case` → `Batch` in code (Phase 4), the build is broken throughout. That's expected and acceptable since these phases are sequential, but keep the in-flight period short — don't park half-rebooted state for >1 day.
- **Phase 6 depends on Phase 2's soft-delete columns.** Don't try to start the worker before the schema lands. The audit-archive design also depends on the audit-hash chain still being per-batch (was per-case) — Phase 4 is when the rename in `audit.ts` happens.
- **Phase 9's docs sweep depends on stable terminology** from Phase 4. Doing the doc sweep early forces a re-sweep.
- **Phase 5 is independent** and can be done early as a confidence boost. Plan keeps it after Phase 4 only because seed-data churn co-locates better.

### Items where I disagree with the locked decisions

- **`extendDeadline` action removal** (implied by dropping disclosure workflow). If Umbra ends up needing per-batch SLA targets (council-internal turnaround commitments), we'll regret this. Keep an eye on REQ matrix; flag if regression appears.

### Items the survey didn't address that this plan must

- **`pg-boss` introduces a `pgboss` schema** in our DB. Migrations need to ignore it (`prisma db pull` from a migrated DB will pick it up if not careful). pg-boss runs its own migrations in-process at boss startup — fine, but document.
- **The audit-hash payload includes `caseId`** literally (`lib/data/audit.ts:48-56`). The Phase 4 rename to `batchId` flips that string. On a 0001_init reboot, no historical hashes exist to worry about. But: if any seed data writes audit entries and we later compute integrity, the seed needs to use the new field name. Trivial but easy to forget.
- **The dev-server `/setup` route has no middleware enforcement** of "wizard incomplete → must finish" (survey Q6). The user has not asked for this gate. Recommend adding a soft gate: if `setup_wizard_state.completedAt` is null, the global header shows a "Complete setup" banner. Add to Phase 8 if desired (estimate +0.25d).

### Cross-cutting concerns

- **Environment-variable rename.** Several env vars (`AZURE_OPENAI_*`, etc.) stay; nothing LGOIMA-flavoured to swap. Build-phase `env.ts` skip is preserved.
- **Telemetry / Application Insights.** Existing telemetry hooks survive; just ensure event names that referenced "case" don't carry into Umbra dashboards. Phase 4 rename touches these.
- **Buffer / Uint8Array gotcha** noted in `CLAUDE.md` is unchanged.

---

## Open questions for the reviewer

1. **RESOLVED — Custom rules' `suggestedGround` field — drop or adapt?**
   Recommendation: ADAPT — replace with a free-form `note` field (per Phase 8 sketch). The rules concept survives and stays useful for council-specific keyword detection without coupling to LGOIMA grounds. Unblocks Phase 2 schema and Phase 8 admin UI.
   **Resolution:** Adapt with `note` field. (Per Phase 8.)

2. **RESOLVED — Scheduled-job runner technology** for retention sweeps + audit archival.
   Recommendation: `pg-boss` (in-process, Postgres-backed, no external infra). Alternatives:
   - Azure Function on a timer trigger (more ops surface; separate deployment artifact).
   - Cron-triggered API route (`/api/internal/retention-sweep`) called by an external cron service or App Service WebJob (simplest but needs an external scheduler).
   - In-process `node-cron` (no persistence; jobs lost on restart — not recommended for retention).
   Decision affects Phase 6 design start.
   **Resolution:** pg-boss.

3. **RESOLVED — Audit-archive output format.** Locked as "CSV + integrity report"; I'd like to also persist a JSON-Lines mirror of the audit entries so chain hashes can be re-verified byte-for-byte. Acceptable to expand the locked decision?
   **Resolution:** JSONL canonical + CSV mirror + `integrity.json`. (Per Amendment A2 / Phase 6.)

4. **RESOLVED — `ExportJob` model — keep or drop?** Re-evaluation requested. Recommendation: KEEP, simplified — drop `packageType`, `batchGroupId`, `batchNumber`, `documentIds`. The remaining fields (status, progress, currentStep, error, storageKey, sha256, filename) are still useful for the polling UI even with a single package type.
   **Resolution:** Keep simplified (drop `packageType`, `batchGroupId`, `batchNumber`, `documentIds`).

5. **RESOLVED — Generic seed council name.** The seed currently uses PNCC (Palmerston North City Council). Options for a generic Umbra seed:
   - Fictional plausible council ("Awatere District Council", "Manaia City Council").
   - Anonymous ("Demo Council").
   - Multi-tenant suite of fictional councils.
   Recommendation: one fictional name (e.g. "Awatere District Council") for clarity in demos; admins set their real org name in the wizard on first run.
   **Resolution:** "Ministry of Demo" (agency, not a council). Per Amendment A8.

6. **RESOLVED — Veil docs disposition.** Survey lists ~22 LGOIMA-keyed docs in `docs/`. Options: (a) move all to `docs/legacy-veil/` for git history, (b) delete from working tree (history retains them), (c) selectively keep ones with reusable content (`tier1-redaction-investigation.md`, `viewer-rework-plan-2026-04.md`) and archive the rest. Recommendation: (c).
   **Resolution:** Selective keep (option c): preserve `tier1-redaction-investigation.md`, `viewer-rework-plan-2026-04.md`, and any other docs with reusable redaction-engine learnings; archive everything LGOIMA-specific to `docs/legacy-veil/`.

7. **RESOLVED — Branding asset readiness.** Umbra logo, favicon, primary/accent colors — do we have these for Phase 9? If not, Phase 9 lands a placeholder and Phase 11 runs with placeholder branding.
   **Resolution:** Use placeholders (Phase 9 lands neutral wordmark + palette).

8. **RESOLVED — Cross-batch audit log download — verification scope?** Phase 6 sketch includes a "Download all audit archives" admin action. Should this re-verify each batch's chain integrity at download time (slower, definitive) or trust the per-batch verification recorded in `PurgeLog.chainValid` (faster, freshness-dependent)?
   **Resolution:** Re-verify chain integrity at download time (slower but right tradeoff for legal-grade audit).

9. **RESOLVED — Default retention values — admin-configurable from setup wizard or only post-setup?** REQ-015 says configurable; the wizard could prompt for it (adds a 6th step) or it could default to 14d/7d and live behind admin settings only. Recommendation: defaults applied silently; admin tunes post-setup.
   **Resolution:** Silent defaults (14d retention, 7d grace), admin tunes post-setup.

10. **RESOLVED — Veil git history scope on the new remote.** Locked decision: retain Veil's local history in the new Umbra checkout, push to `eugene-datasing/clarivus_umbra`, and leave `DataSing/clarivus_veil` entirely untouched (Veil is a live product). The safe-rewire procedure is in Phase 1 (Amendment A7).

   **Resolution:** Leave `DataSing/clarivus_veil` untouched. Push local history to `eugene-datasing/clarivus_umbra` only.

---

## Verification

End-to-end smoke after Phase 11:

1. **Boot.** `npm run dev`; confirm pg-boss worker starts (log `[pg-boss] worker started`).
2. **Setup wizard.** Visit `/setup`, complete 5 steps, end at `/`.
3. **Activation.** New SSO admin sign-in → activation code flow → admin dashboard.
4. **Batch lifecycle.** Create batch → upload `.pdf`, `.docx`, `.eml`, `.msg` (one of each — covers REQ-001) → confirm canonical-PDF generation → review detections (confirm `nz-driver-licence` detection on a fixture; covers REQ-005) → sign off → export ZIP.
5. **Export contents.** ZIP contains: `redacted/{name}.pdf` for each, `redaction-schedule.pdf`, `audit-timeline.pdf`, `audit-log.csv`, `audit-log.pdf`, `manifest.json`. No cover letter, no cost-recovery, no LGOIMA strings.
6. **Soft-delete.** Admin clicks "Delete" on the batch → goes to Trash → batch hidden from active list (covers REQ-016).
7. **Purge Now (skip-grace).** Confirm with reason → batch + documents + detections + audit entries gone from DB → blobs under `{batchId}/` deleted → `archives/{YYYY}/{batchId}/audit.jsonl` (canonical) + `audit.csv` (mirror) + `integrity.json` written → `PurgeLog` row created.
8. **Auto-retention.** Set retention to 1 minute (test override); export a batch; wait for sweep; confirm soft-delete then hard-delete. Reset to 14d.
9. **Roles.** Reviewer user logs in → no `/admin/*` access; admin can edit users + retention + purge.
10. **Audit chain integrity.** Run `verifyAuditIntegrity()` against a non-deleted batch → returns `{ valid: true }`. Re-parse the archived JSONL for a purged batch → independent integrity verification re-computes hashes match `integrity.json.sha256OfJsonl`.

Tests:
- `npm run test` — Vitest, all green (target: ≥ 250 unit tests after deletions + additions).
- `npm run test:e2e` — Playwright, all green (target: ≥ 220 e2e tests after deletions + additions).
- `npm run lint` — clean.
- `tsc --noEmit` — clean.

---

## Phase 12 — Refocus on mass PII redaction

Umbra v1 deployed cleanly (Phase 11b) but inherited a curatorial,
per-document review framing from the Veil-era LGOIMA disclosure
workflow. The actual product job is **mass PII redaction**: take N
documents → return N redacted PDFs with high recall on names + standard
identifiers + a small new "sensitive-context" bucket, and reserve
reviewer time for the genuinely uncertain calls.

Phase 12 is the second major repositioning since the Veil → Umbra fork
and is comparable in scope. Total estimate **~26-27 person-days** across
six sub-phases.

### Locked decisions (Phase 12)

1. **Detection scope = strict PII only.** **KEEP**: `personal-name`,
   `phone`, `email-addr`, `address`, `ird`, `nz-driver-licence`, `nhi`,
   `nz-passport`, `bank-account`, `vehicle-reg`, `manual`, plus a new
   `sensitive-context` bucket for medical / personal-circumstances
   content (per REQ-006). **DROP**: `commercial`, `council-commercial`,
   `negotiation`, `legal-privilege`, `confidential`, `free-frank`,
   `harassment-risk`, `cultural-sensitivity`, `safety-concern`,
   `law-enforcement`, `health-safety`.
2. **Default behaviour = auto-redact at write time.** High-confidence +
   regex matches auto-applied (`status: "accepted"`); medium-confidence
   land in a "needs review" tray (`status: "pending"`); low-confidence
   ignored.
3. **Approval memory = within-batch propagation only (scope b).**
   Approve a name once, propagate to other occurrences in the same
   batch with disambiguation context. Cross-batch propagation
   (scope c) deferred to v3 — the false-positive risk of name
   collisions across unrelated batches is too high for v2.
4. **Production strategy = in-place merge to main.** Each sub-phase
   merges to `main` and deploys when complete; no long-lived `phase-12`
   branch.
5. **Legacy data = purge at 12.5.** Deployed DB has only the Ministry
   of Demo seed (no documents → zero detection rows). Bulk
   `DELETE FROM detections` is effectively free; do it once in 12.5
   alongside the schema migration.

---

## Phase 12.0 — Investigation pass (DONE)

**Goal.** Scope the mass-PII rework, identify why personal names aren't
being caught reliably on the deployed instance, and produce a phased
plan with file/line citations.

**Scope.**
- Read the entire detection pipeline (ai-detect.ts, patterns.ts,
  label-adjacent.ts, entity-propagation.ts, section-marker-detect.ts,
  process.ts).
- Map current → target workflow for mass redaction.
- Inventory the blast radius of dropping the 11 LGOIMA-style detection
  types.
- Run a one-off prompt-recall verification (current LGOIMA prompt vs a
  stripped PII-only prompt) against three test documents to confirm
  the prompt itself is the dominant cause of low name recall.

**Outputs.**
- `docs/umbra-v2-investigation.md` (~750 lines) — current-state
  assessment, file-by-file blast radius, structural change map, and
  effort estimates.
- `docs/umbra-v2-prompt-verification.md` — verdict on hypothesis A
  with per-document recall comparison.

**Verdict.** Hypothesis A (LGOIMA-curatorial prompt suppresses
personal names) **CONFIRMED strongly**:

| Document | Current prompt recall | Stripped prompt recall | Delta |
|---|---|---|---|
| C-synthetic (policy memo) | 44% (4/9) | 100% (9/9) | +125% |
| B2-witness (real fixture) | 50% (3/6) | 100% (6/6) | +50% |
| B3-long-investigation | (10p, mixed) | (excl DOBs) | +80% |

The missed names are exactly the categories the prompt's framing
predicts: council officials, third-party professionals, and
witness/grievance names re-typed as `harassment-risk` *sentences*
rather than `personal-name`. **The Phase 12.1 prompt rewrite solves
both the locked-scope reduction AND the name-recall gap as the same
change.**

**Files touched.** Two new docs in `docs/`. No code touched. The
verification harness was a one-off `scripts/verify-prompt-recall.ts`
that was deleted post-run (raw output preserved at
`/tmp/verify-prompt-recall.txt` for reference).

**Status.** Done. Commits in `main`.

**Effort actual.** 0.5 person-day.

**Dependencies.** None.

---

## Phase 12.1 — Detection-scope drop + AI prompt rewrite + bench re-cut

**Goal.** Land the locked-scope detection-type drop AND the prompt
rewrite together, since the prompt has to be re-cut anyway when 11
governance/commercial types disappear. The recall-gap fix is a
side-effect of the same change.

**Scope.**

*Type drops.*
- `lib/detection-type-grounds.ts:9-32` — delete entries for the 11
  dropped types from `DEFAULT_GROUND_FOR_TYPE`.
- `lib/pipeline/ai-detect.ts:119-126` — remove dropped types from
  `ALL_AI_TYPES`.
- `lib/pipeline/ai-detect.ts:133-160` — remove the
  `GROUND_DETECTION_TYPE_MAP` entirely (no longer needed once grounds
  are gone).
- `lib/data/settings.ts:70-89` `DEFAULT_DETECTION_TOGGLES` — remove the
  10 toggles for dropped types; add a "Sensitive Context" toggle.
- `lib/data/settings.ts:93-113` `DETECTION_TYPE_MAP` — same.

*Prompt rewrite (the headline change).* `lib/pipeline/ai-detect.ts:207-395`
gets wholesale-replaced. New `SYSTEM_PROMPT_BASE`:
- Open with **PII-redaction framing**, not LGOIMA-disclosure framing.
- No "withheld under LGOIMA" verbiage.
- No `buildGroundsReference()` (delete the grounds-table builder
  entirely).
- No `:373-381` carve-out for council officials, no "professional
  capacity" suppression. Council staff names ARE PII in v2.
- Drop the `harassment-risk` siphoning instructions
  (`:286-292, :321-323`); witness/grievance names route to
  `personal-name` automatically.
- Keep the DOB instruction (`:218`) — DOBs still ride under
  `personal-name`.
- Keep the labelled-field handling (`:293`) — works for the new
  `sensitive-context` bucket too.
- Add explicit guidance for the new `sensitive-context` bucket: medical
  diagnoses, personal circumstances, individual health/safety details
  per REQ-006.
- Worked examples: trim from 19 to ~6, all PII-shaped (names with
  honorifics, DOBs, labelled-field rows, addresses, sensitive-context
  examples). Drop all 13 governance/commercial examples.

*Label-adjacent retargeting.* `lib/pipeline/label-adjacent.ts:138-191` —
employee numbers, salary bands, and ICD-10 codes currently emit
`confidential`. Retarget to `sensitive-context`.

*Entity-propagation trim.* `lib/pipeline/entity-propagation.ts:80` —
remove `harassment-risk` from `SEED_TYPES`. Propagator becomes a
personal-name specialist.

*Files deleted.*
- `lib/pipeline/section-marker-detect.ts` (430 LoC, free-frank only).
- `lib/pipeline/doc-classify.ts` — classifier-routing was for the
  governance pathway; PII-only doesn't need it. Drop the import + call
  site in `process.ts:481-496`.
- `lib/lgoima-grounds.ts` — vocabulary obsolete.
- `lib/__tests__/lgoima-grounds.test.ts`.
- `lib/pipeline/__tests__/section-marker-detect.test.ts`.

*Bench re-cut.* `lib/bench/pathways.ts` currently scores across
PII / commercial / governance pathways. v2 collapses to PII +
sensitive-context. Re-cut pathway definitions, update fixture expected
files (`test-fixtures/bench/A.expected.json`, B1, B2, B3, C1) — most
are still relevant, just need the 11 governance/commercial-typed
expected entries removed and the `harassment-risk` typed witness names
returned to `personal-name`.

*Validation + UI cleanup.* `lib/validation/schemas.ts` — re-cut detection
type enum. `app/batches/[id]/review/[docId]/review-client.tsx` and
`bulk-review-client.tsx` — drop `lgoimaGrounds` import + ground-dropdown
UI, drop bulk-apply-ground panels.

*Seed update.* `prisma/seed.ts` — Ministry of Demo currently has zero
documents. No detection rows to backfill. Just confirm the seed doesn't
reference dropped types in any helper data.

*Migration: ad-hoc SQL.* `DELETE FROM detections WHERE type IN (…)`
deferred to Phase 12.5 (production migration). Locally, `prisma migrate
reset` clears the dev DB.

**Out of scope.** Tier-routing at write time (Phase 12.2). Tray UI
(Phase 12.3). Cross-doc approval (Phase 12.4).

**Files touched.** ~20 source files (most edits small, prompt rewrite
is the dominant volume). 5 file deletions. 2 new files (none expected
unless the prompt grows beyond a single string).

**Sequencing.**

1. Type drops first (mechanical edits across the inventory).
2. Prompt rewrite as a single dedicated commit (don't entangle with
   other edits — prompt iteration loop will produce many small commits
   against the bench fixtures).
3. Bench re-cut + fixture-expected updates.
4. UI cleanup (review-client, bulk-review-client).
5. tsc clean → lint clean → unit tests green → bench green.

**Exit criteria.**
- `grep -rn "lgoima-grounds\|LGOIMA\|withholding ground\|free-frank\|harassment-risk\|safety-concern\|law-enforcement\|health-safety\|cultural-sensitivity\|legal-privilege\|negotiation\|council-commercial\|commercial" lib/pipeline lib/data lib/actions lib/validation lib/bench app/batches` returns matches only in test-fixture historical baselines or `docs/legacy-veil/`.
- New v2 prompt achieves ≥80% personal-name recall on B2 and ≥90% on
  C-synthetic (bench-measured).
- All vitest + e2e green.

**Rollback.** Per-commit revert. The prompt rewrite is the highest-risk
single commit; revert restores the legacy prompt instantly.

**Effort.** ~9 person-days. The 2-day prompt-iteration loop against
bench fixtures is the dominant cost.

**Dependencies.** Phase 12.0 (investigation locks the scope).

---

## Phase 12.2 — Tier-routing in pipeline + state machine

**Goal.** Move from "all detections start at `pending` and need
reviewer touch" to "high-confidence auto-accepted, medium goes to tray,
low ignored." Single-day surgical change in `process.ts` plus state-
machine adjustments.

**Scope.**

*Pipeline change (the small one).* `lib/pipeline/process.ts:884-901` —
the per-detection `prisma.detection.create({ data: { …, status:
"pending" }})` call. Replace static `"pending"` with a tier-routing
helper:

```ts
const tier = bucketConfidence(det.confidence, det.source);
const status =
  tier === "high"   ? "accepted" :
  tier === "medium" ? "pending"  :
                      "rejected"; // or just skip the create
```

Pattern + label-adjacent matches default to `high` (deterministic,
confidence 95). AI detections route by their model-emitted confidence.
Custom-rule matches route by their rule's `confidence` field.

*New helper.* `lib/pipeline/tier-routing.ts` (~30 LoC) exporting
`bucketConfidence(confidence: number, source: string): "high" |
"medium" | "low"`.

*New settings key.* `lib/data/settings.ts` — add `AUTO_REDACT_CONFIG`
alongside `CONFIDENCE_THRESHOLDS`:

```ts
AUTO_REDACT_CONFIG: "auto_redact_config",
…
export const DEFAULT_AUTO_REDACT_CONFIG = {
  highThreshold: 85,        // ≥ this → auto-accept
  mediumLowerBound: 50,     // ≥ this → tray; below → drop
  enabled: true,            // master switch
};
```

Reuse the existing `DEFAULT_CONFIDENCE_THRESHOLDS` slider from the
setup wizard / admin Settings tab as the configuration surface.

*Document state machine.* Add an `auto-redacted` short-circuit:
- After processing, if no detections landed at `pending` (i.e. all
  high-confidence auto-accepted, none in the tray), document goes
  straight to `auto-redacted` (skipping `in-review` and `reviewed`).
- If any detections are pending, document goes `ready` → reviewer-tray
  flow per usual.
- `recomputeDocumentStatus` (`lib/actions/detection-actions.ts:47-69`)
  recognises `auto-redacted` and treats it as terminal (no regression
  back to `in-review` unless an admin explicitly resets).

*Batch state machine.* `recomputeBatchStatus`
(`lib/data/batches.ts:143-200`) gets a new branch:
- All documents `auto-redacted` (or mix of `auto-redacted` +
  `signed-off`) → batch `auto-redacted`.
- Existing branches (processing, ready-for-review, reviewed, exported)
  remain.

*Auto-export trigger.* When batch transitions to `auto-redacted` AND
auto-redact-config has `autoExport: true`, fire the existing export
action (`/api/export/[batchId]/generate`) automatically. The export
infrastructure stays unchanged; just a new triggering call site.

**Out of scope.** Tray UI (Phase 12.3). The pipeline change just
populates the tray; the UI presents it.

**Files touched.** New: `lib/pipeline/tier-routing.ts`. Modified:
`lib/pipeline/process.ts`, `lib/data/settings.ts`,
`lib/actions/detection-actions.ts`, `lib/data/batches.ts`. No schema
change (states are strings).

**Sequencing.**
1. Tier-routing helper + unit tests.
2. Pipeline write-path change.
3. State-machine updates.
4. Auto-export wiring.

**Exit criteria.**
- A test batch with all-deterministic-pattern PII goes
  `processing → auto-redacted` without reviewer involvement.
- A test batch with one ambiguous AI-flagged sentence goes
  `processing → ready → in-review` (one row in the tray).
- Mix-mode test batch: some docs auto-redacted, one stuck in tray —
  batch stays `processing` until tray cleared, then goes `reviewed`.
- All existing vitest + e2e flows still pass (state-machine additions
  are additive).

**Rollback.** Single revert restores per-detection-pending baseline.

**Effort.** ~2 person-days.

**Dependencies.** Phase 12.1 (so the prompt has been re-cut and
high-confidence detections are reliably name-shaped before
auto-acceptance kicks in).

---

## Phase 12.3 — Tray UI + per-doc review trim + auto-export wiring

**Goal.** Replace the existing per-document review-as-default with a
**tray-first reviewer experience**. Per-doc review remains for
exception cases.

**Scope.**

*Tray UI (the major rewrite).*
`app/batches/[id]/bulk-review/bulk-review-client.tsx` (982 LoC) becomes
**the** reviewer entry point. Reframe as "Tray":
- Cluster view by `(type, normalisedText)` per batch — already
  prototyped in `bulkAcceptBySimilar`'s in-memory matching
  (`lib/actions/detection-actions.ts:519-520`).
- Drop the threshold slider (now an admin setting in 12.2).
- Drop the bulk-apply-ground UI panels (no grounds in v2).
- Each cluster shows: count, document count, occurrences breakdown,
  surrounding-context snippet preview (when available — Phase 12.4
  populates `pageContext`).
- Reviewer actions: approve cluster, reject cluster, expand to
  per-occurrence subset.
- Empty-tray state: "Ready to export" CTA.

*Per-doc review trim.*
`app/batches/[id]/review/[docId]/review-client.tsx` (2493 LoC) —
estimated 30-40% trim:
- Drop ground-dropdown UI per detection (no grounds).
- Drop LGOIMA-grouping sidebar sections.
- Simplify per-detection accept/reject (less metadata to display).
- Keep the canvas overlay + page navigation (still needed for
  exception review).
- Default landing page becomes the tray; per-doc opens only on
  reviewer click-through from a cluster.

*Sign-off rework.* Drop the per-document `signed-off` requirement when
a document is `auto-redacted` (no detections in tray means no review
needed). Manual sign-off still available as an admin escape hatch for
auto-redacted-but-not-trusted batches.

*Auto-export wiring* (UI side). Export-client surfaces the auto-export
toggle from `AUTO_REDACT_CONFIG`; manual trigger remains for fallback.

**Out of scope.** Cross-doc approval (Phase 12.4) — the tray clusters
intra-batch; Phase 12.4 adds the disambiguation context that makes the
clusters more powerful.

**Files touched.** ~6 client components, all in `app/batches/[id]/`.
No new files unless `lib/data/tray.ts` makes sense as the cluster
query module.

**Sequencing.**
1. Tray cluster-query helper (server action returning shaped data).
2. Tray UI rewrite (clean-slate against the existing
   bulk-review-client structure).
3. Per-doc review trim (mechanical removals).
4. Sign-off conditional logic.
5. e2e spec updates.

**Exit criteria.**
- A batch with mixed-confidence detections lands the reviewer on the
  tray view by default.
- Approve-cluster-of-N works in a single click; status changes
  propagate to all N detection rows.
- Auto-redacted-only batch surfaces an export CTA, no review steps.
- e2e green.

**Rollback.** Per-commit revert. The 982-LoC bulk-review rewrite is
the largest single commit; revert restores the v1 LGOIMA-aware tray
shell.

**Effort.** ~5.5 person-days (3d tray rewrite + 1.5d per-doc trim + 1d
auto-export wiring).

**Dependencies.** Phase 12.2 (state machine + tier-routing populated).

---

## Phase 12.4 — Cross-batch approval scope (b) + smart matching

**Goal.** Within-batch approval propagation with disambiguation
context. "Approve Sarah Mitchell once → all 8 occurrences across
3 docs in this batch transition to accepted."

Scope (c) — cross-batch propagation — explicitly **deferred to v3**
per the investigation report. Cross-batch name collisions (two
genuinely different "Sarah Mitchell"s in unrelated batches) are a
real false-positive class and the auto-applied redactions are
hard to recover from once exports ship.

**Scope.**

*Schema migration (additive).* `prisma/schema.prisma` Detection model:
- Add `pageContext: String?` column (~200 bytes per row, sparse — only
  populated when bbox is available and there's surrounding text).
- Add `@@index([type, text])` for fast clustering queries.

Migration is single-file additive; no row rewrites.

*Pipeline pageContext population.* `lib/pipeline/process.ts` — at bbox
enrichment time, capture ±100 chars of page text around the detection
into `pageContext`. Trivial: page text is already loaded.

*Tray cluster query.* New server action in
`lib/actions/detection-actions.ts`:
```ts
async function getTrayClusters(batchId: string) {
  // Group pending detections by (type, normalised(text)).
  // Return cluster rows: { type, text, count, docCount,
  //   contextSnippets: [], detectionIds: [] }
}
```

Reuses the existing `bulkAcceptBySimilar`
(`detection-actions.ts:503-555`) as the worker for "approve cluster" —
the cluster query just shapes the data; the mutation path is already
written.

*Tray UI cluster row.* "Sarah Mitchell — 8 occurrences in 3 docs"
with snippet expansion: hover/click to preview the surrounding
context for disambiguation. Reviewer can approve all, reject all, or
pick a subset.

**Out of scope.**
- `ApprovedEntity` persistent allow-list (deferred — only matters
  when reviewers are repeatedly approving the same names across
  batches; ship without it first, add when the feedback comes).
- Cross-batch propagation (scope c) — v3.
- AI-driven disambiguation (separate AOAI call to compare clusters) —
  v3.

**Files touched.** Schema migration (1 file). `lib/pipeline/process.ts`
(small edit). `lib/actions/detection-actions.ts` (new query function).
`app/batches/[id]/bulk-review/bulk-review-client.tsx` (cluster row UI).

**Sequencing.**
1. Schema migration + idempotent re-run on dev DB.
2. pageContext pipeline change.
3. Cluster query.
4. UI cluster row.
5. e2e spec update.

**Exit criteria.**
- `prisma migrate dev --create-only` produces a clean additive
  migration.
- Sample batch with 3 docs naming "Helen Ferguson" 8× shows ONE
  cluster row in the tray with `count: 8, docCount: 3`.
- Approve cluster → all 8 rows go `pending → accepted` atomically.
- pageContext snippets render in the UI for disambiguation.

**Rollback.** Schema rollback via reverse migration. Code rollback is
per-commit.

**Effort.** ~3 person-days.

**Dependencies.** Phase 12.3 (tray UI exists to host the cluster row).

---

## Phase 12.5 — Production migration + telemetry + reviewer retraining

**Goal.** Land the v2 stack on the live deployment. Purge legacy
detections (zero in production today, but the SQL must run as part of
the deployment script). Refresh telemetry dashboards. Update reviewer-
facing docs.

**Scope.**

*Production data migration.* Single SQL statement run via
`scripts/deploy/migrate-db.sh` extension:
```sql
DELETE FROM detections
WHERE type NOT IN (
  'personal-name', 'phone', 'email-addr', 'address', 'ird',
  'nz-driver-licence', 'nhi', 'nz-passport', 'bank-account',
  'vehicle-reg', 'sensitive-context', 'manual'
);
```

Production DB has the Ministry of Demo seed (no documents → zero
detection rows), so the DELETE affects 0 rows. Safe by construction.
Also re-run any schema migrations from 12.4.

*Settings reset.* New `AUTO_REDACT_CONFIG` defaults applied via the
existing setup-wizard / admin-settings UI (admins can tune post-deploy).

*Telemetry refresh.* Application Insights dashboards updated for the
new state machine: replace per-doc review-time metrics with
tray-throughput + auto-redact-rate metrics. KQL queries shipped in
`docs/telemetry/`.

*Documentation refresh.*
- `CLAUDE.md` — Quick Reference table updates (12 detection types,
  `auto-redacted` state, no LGOIMA verbiage).
- `DEMO-SCRIPT.md` — re-cut the demo flow around mass-redaction
  framing.
- `PRODUCT-FEATURES.md` — same.
- `README.md` — top-level positioning refresh.

*Final smoke.* Re-deploy, run the canonical smoke from
`docs/deployment.md`, confirm:
- Healthy `/api/health`.
- Upload a sample doc to a fresh batch.
- High-confidence detections auto-accepted.
- Tray populated only with ambiguous cases.
- Auto-export fires when tray clears.

**Out of scope.** v3 features (cross-batch propagation, AI
disambiguation, ApprovedEntity allow-list).

**Files touched.** `scripts/deploy/migrate-db.sh` (extension).
`docs/CLAUDE.md`, `docs/DEMO-SCRIPT.md`, `docs/PRODUCT-FEATURES.md`,
`README.md`. New `docs/telemetry/` queries.

**Sequencing.**
1. Build + push v2 image (the chained `npm run deploy` command).
2. Run migration (purge + schema additions from 12.4).
3. Restart Web App.
4. Smoke.
5. Documentation push.

**Exit criteria.**
- Deployed Web App returns the v2 prompt's outputs in
  `/api/health`-adjacent telemetry.
- Mass-redact end-to-end works on the live demo.
- README + CLAUDE.md describe Umbra v2, not v1.

**Rollback.** Re-deploy the last v1 image tag (the `:cr-<sha>` tag from
the v1 build). Settings rollback via admin UI; schema rollback via
reverse migration.

**Effort.** ~1 person-day.

**Dependencies.** Phases 12.1 - 12.4 all merged + green test suite.

---

## Phase 12 — plan-level concerns

### The single highest-leverage change

The prompt rewrite in Phase 12.1 is the dominant single change in the
whole programme. It solves both the locked-scope reduction and the
name-recall gap as the same edit. Phase 12.0's verification already
shows 50-125% recall delta on test docs; the production v2 prompt with
`sensitive-context` guidance and bench-tuned wording should land
similarly.

### What's already mostly built

`bulkAcceptBySimilar` (`lib/actions/detection-actions.ts:503-555`) is
the core mechanism for cluster-approval. Phase 12.4 is largely UI work
on top of an existing worker.

### What's risky

- **Bench re-cut is non-optional in 12.1.** Without an updated bench,
  regression metrics post-rip are misleading or unreadable. Plan the
  bench update into the same phase as the prompt rewrite, not as a
  follow-up.
- **State-machine additions in 12.2** are additive but touch hot
  paths. Watch for stale `recomputeDocumentStatus` paths in
  edge-case e2e specs.
- **`pageContext` storage cost in 12.4** is small per-row but sparse
  population matters — populate only when bbox is available, skip on
  long-narrative placeholder rows.

### What's deferred to v3

- **Cross-batch propagation (scope c)** — false-positive risk is real;
  defer until tray feedback shows reviewers are repeatedly approving
  the same names across unrelated batches and the cost of the manual
  step is genuinely high.
- **`ApprovedEntity` persistent allow-list** — same trigger condition
  as scope (c).
- **AI-driven disambiguation** — second AOAI call to compare cluster
  occurrences. Slower + costlier; only needed when scope (b)'s
  surrounding-context UI proves insufficient for reviewer
  confidence.

### Total Phase 12 estimate

~26-27 person-days across 6 sub-phases:

| Sub-phase | Effort |
|---|---|
| 12.0 — Investigation | 0.5d (DONE) |
| 12.1 — Type drop + prompt rewrite + bench re-cut | ~9d |
| 12.2 — Tier-routing + state machine | ~2d |
| 12.3 — Tray UI + per-doc trim + auto-export | ~5.5d |
| 12.4 — Cross-doc approval scope (b) | ~3d |
| 12.5 — Production migration + telemetry + docs | ~1d |
| Test rewrites + E2E updates (across all sub-phases) | ~3d |
| Production migration buffer | ~1d |
| Documentation refresh buffer | ~1d |
| **Total** | **~26-27d** |

Comparable to the original Veil → Umbra fork (~22-25d).
