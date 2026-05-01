# Veil → Umbra Rework: Current-State Survey

**Date:** 2026-05-01
**Branch surveyed:** `feat/parallel-ai-batches`
**Scope:** Read-only assessment to inform scoping of the Umbra fork. No code changes proposed in this pass.

This report answers the 10 framing questions for the rework. All citations are `path:line-range` against the working tree as of the survey date. The report is organised by question; each section is a current-state map, not a proposal.

---

## Q1 — Cases → Batches workflow coupling

The `Case` concept is wired *deeply* into the app — it is more than a folder. It owns its own lifecycle state machine, a 6-stage milestone pipeline, role-gated assignments per milestone, denormalized rollup counters, and an authorization model that derives access from `Case.departments[]`.

### Schema

- `prisma/schema.prisma:50-78` — `Case` model: `reference` (LGOIMA-YYYY-NNN), `requesterName`, `requesterType`, `dateReceived`, `deadline`, `priority`, `departments String[]`, `status` (`draft` default), denorm counters `documentCount`/`reviewedCount`/`redactionCount`, six relations (documents, auditEntries, feedbackExamples, milestones, caseAssignments, exportJobs).
- `prisma/schema.prisma:275-290` — `CaseMilestone`: 6-stage pipeline (`collection`, `processing`, `initial-review`, `senior-review`, `final-approval`, `release`) with `targetDate`/`completedAt`. **Strong workflow semantic.**
- `prisma/schema.prisma:292-311` — `CaseAssignment`: binds users/departments to milestones with `role` constrained at the application layer to `lead-reviewer | sme-reviewer | senior-reviewer | final-approver`. **Strong workflow semantic.**
- `prisma/schema.prisma:80-140` — `Document.caseId` FK, `onDelete: Cascade`.
- `prisma/schema.prisma:194-217` — `AuditEntry.caseId` field; **no FK cascade**, so audit entries orphan if Case is deleted.

### Server actions

- `lib/actions/case-actions.ts:13-51` — `createCase()`: auto-generates LGOIMA reference, assigns departments, deadline.
- `lib/actions/case-actions.ts:53-102` — `extendDeadline()`: gated on `authorizeForCase()`; LGOIMA s14 deadline-extension semantics.
- `lib/actions/pipeline-actions.ts:28-55` — `initializePipeline()`: auto-creates 6 CaseMilestone rows on first pipeline access.
- `lib/actions/pipeline-actions.ts:61-123` — `savePipeline()`: upserts milestone target dates; replaces all CaseAssignment rows in bulk.

### Data accessors

- `lib/data/cases.ts:3-23` — `getCases()`: lists all cases with counters; **no authorization** on the list itself.
- `lib/data/cases.ts:25-44` — `getCase()`: single-case fetch with metadata.
- `lib/data/cases.ts:46-57` — `getNextReference()`: increments LGOIMA-YYYY counter.
- `lib/data/cases.ts:59-79` — `getDashboardStats()`: aggregates by case status.
- `lib/data/cases.ts:92-137` — **`recomputeCaseStatus()`**: state machine that mutates `Case.status` based on aggregated `Document.status`. Documents in `processing/pending` → case `ingesting`; all `reviewed/signed-off` → case `senior-review`; all `signed-off` → case `ready-export`. **Hot path, will need rewrite.**
- `lib/data/pipeline.ts:11-18` — `ROLE_FOR_STAGE` map: `initial-review → reviewer`, `senior-review → senior-reviewer`, `final-approval → final-approver`.
- `lib/data/pipeline.ts:78-103` — `getUsersByDepartment()`.
- `lib/data/pipeline.ts:109-123` — `getPrivilegedUsers()`.
- `lib/data/pipeline.ts:147-179` — `getCasePipeline()`: joins milestones + assignments + user/dept names.

### Routes (everything under `/requests` is case-keyed)

- `app/requests/page.tsx` + `cases-list-client.tsx` — list view via `getCases()`.
- `app/requests/new/page.tsx` + `new-request-client.tsx` — case creation form.
- `app/requests/[id]/page.tsx` + `case-detail-client.tsx` — case detail/overview.
- `app/requests/[id]/pipeline/page.tsx` + `pipeline-client.tsx` — milestone setup with drag-drop role-gated assignment palette. **Pure workflow UI; would not survive un-modified in Umbra.**
- `app/requests/[id]/ingest/page.tsx` — document upload.
- `app/requests/[id]/review/[docId]/page.tsx` — redaction review.
- `app/requests/[id]/qa/page.tsx` — QA workflow.
- `app/requests/[id]/export/page.tsx` — export trigger.
- `app/requests/[id]/audit/page.tsx` — audit log view.

### API endpoints

- `app/api/schedule/[requestId]/route.ts` — schedule mutation.
- `app/api/export/[requestId]/generate/route.ts` — export trigger.
- `app/api/export/[requestId]/batch-status/route.ts` — export job polling.
- `app/api/documents/upload/route.ts` — increments `Case.documentCount`.
- `app/api/documents/[docId]/status/route.ts` — triggers `recomputeCaseStatus()`.
- `app/api/documents/queue-status/route.ts` — case processing queue status.
- `app/api/reports/chain-of-custody/route.ts` — case audit trail rendering.

### Authorization

- `lib/auth/authorize.ts:13-17` — `PRIVILEGED_ROLES = ["admin", "request-manager", "senior-reviewer", "final-approver"]`.
- `lib/auth/authorize.ts:26-61` — **`authorizeForCase(user, caseId)`**: critical coupling. Loads `Case.departments[]` and matches `user.department.name`. Privileged roles bypass the dept check.
- `lib/auth/authorize.ts:67-87` — `authorizeForDocument()`: resolves doc→caseId→`authorizeForCase()`.
- `lib/auth/authorize.ts:130-140` — `requireAdmin()`: admin OR request-manager.

### Real semantics vs "just a folder"

**Real semantics** (will not survive a simple rename):
- `recomputeCaseStatus()` state machine driven by document statuses.
- 6-stage milestone pipeline with role-gated assignment per stage.
- Department-array-based authorization (a "case" is a set of departments).
- LGOIMA reference-number generation (`LGOIMA-YYYY-NNN`).
- Deadline + extension semantics (LGOIMA s14).

**Folder-like semantics** (mostly safe under rename):
- `Case → Document[]` cascade delete.
- Denormalized counters (`documentCount`, `reviewedCount`, `redactionCount`).

### Hottest files for blast radius

1. `lib/data/cases.ts:92-137` — `recomputeCaseStatus()` state machine.
2. `lib/data/pipeline.ts` — entire file is milestone-centric.
3. `app/requests/[id]/pipeline/pipeline-client.tsx` — drag-drop role-gated assignment UI.
4. `lib/auth/authorize.ts:26-61` — `authorizeForCase()` department-array logic.
5. `middleware.ts:50` — admin role array (4 roles hard-coded).
6. `lib/actions/pipeline-actions.ts` — milestone create/save actions.
7. `prisma/schema.prisma:50-311` — Case + CaseMilestone + CaseAssignment models.
8. `app/admin/settings/settings-client.tsx:67-81` — 5-role badge map.
9. `app/requests/[id]/case-detail-client.tsx` — case-metadata display (mostly cosmetic if renamed).
10. `lib/actions/case-actions.ts:53-102` — `extendDeadline()` (LGOIMA-specific).

---

## Q2 — Roles surface (5 → 2 collapse)

The role enum is **not** enforced at the database layer (`User.role` is a free-form string at `prisma/schema.prisma:19`, default `"reviewer"`). Role values are scattered as string literals across middleware, auth helpers, server actions, UI conditionals, and seed data. There are at least **eight distinct hard-coded role lists** that need to be reconciled.

### Where role values appear as literals

- `middleware.ts:50` — `adminRoles = ["admin", "senior-reviewer", "request-manager", "final-approver"]` — gates `/admin/*` routes.
- `lib/auth/authorize.ts:13-17` — `PRIVILEGED_ROLES = ["admin", "request-manager", "senior-reviewer", "final-approver"]` — bypasses department checks.
- `lib/auth/authorize.ts:130-140` — `requireAdmin()` — admin OR request-manager.
- `lib/data/pipeline.ts:11-18` — `ROLE_FOR_STAGE` map (3 stages → 3 roles).
- `lib/data/pipeline.ts:109-122` — `getPrivilegedUsers()` queries `role IN ["senior-reviewer", "final-approver", "admin"]`.
- `lib/actions/detection-actions.ts:551` — `applyConfidenceThreshold()` hard-gates on `["admin", "request-manager", "senior-reviewer"]`.
- `app/api/scim/Groups/route.ts:24-27` — SCIM Groups: 4 roles.
- `prisma/seed.ts:46-60` — seed fixture creates users with all 5 roles.

### Authorization call sites

- `lib/actions/department-actions.ts` — 6× `requireAdmin()` (5 dept CRUD + 1 bulk activate).
- `lib/actions/rule-actions.ts` — 6× `requireAdmin()` (rule CRUD).
- `lib/actions/settings-actions.ts` — 5× `requireAdmin()` (settings mutations).
- `lib/actions/setup-actions.ts` — 6× `requireAdmin()` (setup/activation).
- `lib/actions/detection-actions.ts` — 5× `authorizeForCase()` + 1 explicit role check at line 551.
- `lib/actions/document-actions.ts` — 2× `authorizeForCase()`.
- `lib/actions/manual-detection-actions.ts` — 1× `authorizeForCase()`.
- `lib/actions/pipeline-actions.ts` — 2× `authorizeForCase()`.

### UI conditionals & navigation

- `components/layout/sidebar.tsx:40-44` — `roleLabels` map only defines 3 of 5 roles (`reviewer`, `senior-reviewer`, `admin`). request-manager and final-approver fall back to raw role string.
- `components/layout/sidebar.tsx:109` — `canAccessAdmin = userRole !== "reviewer"` (gates whole admin menu section).
- `app/admin/settings/settings-client.tsx:67-81` — `roleBadgeMap` + `roleLabelMap` hard-code 5 roles with distinct colours (red=admin, purple=request-manager, teal=senior-reviewer, amber=final-approver, blue=reviewer).
- `app/setup/setup-wizard-client.tsx:1181-1182` — role dropdown enumerates all 5.
- `app/requests/[id]/pipeline/pipeline-client.tsx:191-202` — 4-branch roleLabel + roleColor map.
- `app/requests/[id]/pipeline/pipeline-client.tsx:369, 380, 433, 466-475` — drag-drop validation: `senior-review` accepts `senior-reviewer + admin`; `final-approval` accepts `final-approver + admin`.
- `lib/pipeline/reviewer-workload-report.ts:70-72` — role labels in workload report.

### What breaks at 5 → 2 collapse

1. **Pipeline assignment UI** (pipeline-client.tsx) — drag-drop palettes for `senior-review` and `final-approval` stages have no candidates. Either auto-block these stages or remove them from the wizard.
2. **`applyConfidenceThreshold()`** — currently admin/request-manager/senior-reviewer only. Becomes admin-only unless promoted to all.
3. **Privileged-user filtering** — `getPrivilegedUsers()` returns empty if non-admin roles disappear.
4. **Department-array authorization bypass** — only admin will bypass; reviewers must be in a case's `departments[]` to access. May force structural changes to dept membership.
5. **Middleware admin gating** — collapses to admin-only access to `/admin/*` (currently 4 roles get in).
6. **Sidebar admin menu** — currently visible to non-reviewers (4 roles); collapses to admin-only.
7. **Audit-trail role recording** — `AuditEntry.userRole` retains historical role strings (read-only history; safe).
8. **SCIM Groups** — `app/api/scim/Groups/route.ts` lists 4 roles; trim to 2 or external IdP mappings break.

### Tests with role assumptions

- `lib/auth/__tests__/authorize.test.ts:24-25` — asserts request-manager passes requireAdmin.
- `lib/auth/__tests__/authorize.test.ts:34-35` — asserts senior-reviewer fails requireAdmin.
- `e2e/auth/rbac.spec.ts` — full RBAC matrix.
- `e2e/admin/workflow-settings.spec.ts` — toggles for senior-review / final-approval stages.

---

## Q3 — Detection-type plumbing (adding nz-driver-licence)

**Important pre-finding:** `driver-licence` ALREADY EXISTS as a detection type in this codebase. It has a regex pattern, a default LGOIMA ground, an enabled UI toggle, and dedicated unit tests for context-word disambiguation. The current count is **22 types** (not 21 as `CLAUDE.md` states); the test suite at `lib/__tests__/detection-type-grounds.test.ts:53` enforces this count.

If "add `nz-driver-licence`" means "a separate type from `driver-licence`", the checklist below applies. If it means "rename the existing `driver-licence` to `nz-driver-licence` for branding clarity", far fewer files are touched but seed/test fixtures will all need their type strings updated.

### Type schema is free-form string

- `prisma/schema.prisma:163` — `Detection.type` is `String` with no enum constraint.
- `lib/validation/schemas.ts:99-102` — `changeDetectionTypeSchema.newType` is `z.string().min(1).max(30)` (open-ended).
- `lib/validation/schemas.ts:119-126` — `createManualDetectionSchema.type` is `z.string().min(1).max(50)` (open-ended).

### Authoritative type list

- `lib/detection-type-grounds.ts:9-32` — `DEFAULT_GROUND_FOR_TYPE` map (22 entries today). Existing `"driver-licence": "s7_2a"` at line 17.
- `lib/detection-type-grounds.ts:38-41` — `getDefaultGroundForType()` lookup; returns `""` for unknown types and `custom-*`-prefixed types.

### AI prompt + AI-producible types

- `lib/pipeline/ai-detect.ts:120-128` — `ALL_AI_TYPES` array (19 entries). **`driver-licence` is NOT in this list** (regex-only today, not AI-produced).
- `lib/pipeline/ai-detect.ts:135-162` — `GROUND_DETECTION_TYPE_MAP` groups types by LGOIMA pathway (privacy, commercial, governance, enforcement).
- `lib/pipeline/ai-detect.ts:209-250` — `SYSTEM_PROMPT_BASE` system prompt with hard-coded type-description block.
- `lib/pipeline/ai-detect.ts:283-294` — structural-heuristics section (labelled-field signals).
- `lib/pipeline/ai-detect.ts:351-353` — worked example references `NZ Driver Licence | HM847219` mapped to `driver-licence` type.
- `lib/pipeline/ai-detect.ts:435` — runtime filter via `getEnabledDetectionTypes()`.

### Regex / pattern detection

- `lib/pipeline/patterns.ts:89-175` — `PATTERNS` array, ordered most-specific-first.
- `lib/pipeline/patterns.ts:151-160` — existing `driver-licence` pattern: 2-letter + 6-digit regex, `requireContext: ["licence", "license", "driver", "DL"]`, ground `s7_2a`.
- `lib/pipeline/patterns.ts:162-167` — `nz-passport` pattern (potential collision with driver-licence — discriminated by context-word guard).

### UI toggles, labels

- `lib/data/settings.ts:72-115` — `DEFAULT_DETECTION_TOGGLES` array + `DETECTION_TYPE_MAP`. Line 80: existing `{ label: "Driver Licence Numbers", enabled: true }`. Line 103: `"Driver Licence Numbers" → "driver-licence"`.
- `lib/data/settings.ts:121-133` — `getEnabledDetectionTypes()` reads toggles, returns `Set<string>`. Used at `lib/pipeline/process.ts:41` and `lib/pipeline/ai-detect.ts:435`.
- No centralised type→colour/icon map in `components/`. Styling is by per-component class lookup.

### Content builder + downstream

- `lib/pipeline/content-builder.ts:21-28` — `DetectionInput.type` is free-form `string`. **No type-specific rollup logic.** Type passes through unchanged.
- `lib/pipeline/schedule.ts` — withholding schedule groups detections by *ground*, not by type.
- `lib/pipeline/cover-letter.ts` — also operates on grounds, not types.

### Tests

- `lib/__tests__/detection-type-grounds.test.ts:8-49` — enumerates all 22 types; line 53 asserts `mappedTypes.length === 22` (must increment to 23 if a new type is added).
- `lib/pipeline/__tests__/patterns.test.ts` — driver-licence vs nz-passport context-word discrimination cases.
- `lib/pipeline/__tests__/canonical-pdf.integration.test.ts` — integration test referencing `HM847219` driver-licence detection.
- `e2e/admin/detection-settings.spec.ts` — toggle-list UI test.

### Seed data / fixtures

- `prisma/seed-extra-docs.ts` — inline detection fixtures with hard-coded type strings.
- `scripts/seed-content.ts` — additional fixtures.

### Checklist to add a brand-new AI-producible type

1. `lib/detection-type-grounds.ts:9-32` — add map entry.
2. `lib/__tests__/detection-type-grounds.test.ts:53` — bump count assertion.
3. `lib/pipeline/ai-detect.ts:120-128` — add to `ALL_AI_TYPES`.
4. `lib/pipeline/ai-detect.ts:135-162` — add to `GROUND_DETECTION_TYPE_MAP`.
5. `lib/pipeline/ai-detect.ts:209-250` — add description bullet to system prompt.
6. `lib/pipeline/patterns.ts` — optional regex pattern (with `requireContext` if collision risk).
7. `lib/data/settings.ts:72-115` — add UI toggle entry + label map.
8. `prisma/seed-extra-docs.ts`, `scripts/seed-content.ts` — add fixtures.
9. `e2e/admin/detection-settings.spec.ts` — verify toggle appears.
10. New unit test for the regex (if pattern added).

### Coupling that goes away in Umbra

- `lib/detection-type-grounds.ts` exists *because* of LGOIMA. Stripping LGOIMA grounds either deletes this file outright or replaces its codomain with a generic categorisation.
- AI prompt's pathway grouping (privacy/commercial/governance/enforcement) is LGOIMA-pathway terminology. The pathway names can be repurposed; the LGOIMA ground IDs in the prompt cannot.

---

## Q4 — Email pipeline current state

**.eml and .msg ingestion are end-to-end functional today.** Both formats upload, validate, parse, render to a canonical-PDF transcript, and produce the standard ExtractionResult page+text structure that feeds detection. **The single missing piece for full REQ-001 satisfaction is attachment-as-child-document processing** (REQ-003 v2): attachments are extracted into memory but not persisted as separate `Document` rows.

### `lib/pipeline/email-extract.ts` (318 lines)

Public surface:
- `extractMsg(buffer): EmailContent` (lines 137-218) — parses Outlook `.msg` (CFBF) via `@kenjiuno/msgreader`. Returns headers (from/to/cc/date/subject/messageId), text body, HTML body, attachments. Skips hidden/inline attachments and embedded MSG sub-messages. Resolves SMTP address from multiple MSG fields (Exchange X500, etc.).
- `emailContentToExtractionResult(email): ExtractionResult` (lines 268-317) — converts to pipeline format. Page 1 = headers block; Page 2 = plain-text or HTML-stripped body. Returns `attachments[]` for downstream child-document processing.
- `mimeFromExtension()` (lines 104-129) — covers `.eml → message/rfc822`, `.msg → application/vnd.ms-outlook`.
- Helpers: `resolveSenderAddress`, `formatSender`, `formatRecipients`, `stripHtml`, `extractExtFromFilename`.
- `EmailContent` interface (lines 21-36) — `{ subject, from, to, cc, date, messageId, textBody, htmlBody, attachments[] }`.

### `lib/pipeline/email-to-pdf.ts` (189 lines)

Public surface:
- `renderEmailAsPdf(buffer, fileType): Promise<Buffer>` (lines 34-54) — parses .eml or .msg, renders HTML transcript, runs through LibreOffice headless to PDF. Rejects unrecognized file types.
- `renderTranscriptHtml(data): string` (lines 113-160) — minimal HTML (no scripts/iframes/remote resources). Definition-list headers + `<pre>` body + attachment-name listing (no cid: URIs). All HTML-escaped.
- Internals: `parseEml()` (lines 56-91, mailparser), `parseMsgForTranscript()` (lines 93-111, msgreader).

### Wiring into the main pipeline

- `lib/pipeline/extract.ts:24` — imports from email-extract.
- `lib/pipeline/extract.ts:206-282` — `extractFromEmail()` parses `.eml` directly via `mailparser.simpleParser` (does NOT route through email-extract.ts).
- `lib/pipeline/extract.ts:290-293` — `extractFromMsgFile()` calls `extractMsg()` then `emailContentToExtractionResult()`.
- `lib/pipeline/canonical-pdf.ts:39-84` — `buildCanonicalPdf()` dispatches `.eml`/`.msg` → `renderEmailAsPdf()`. Returns `{ pdfBuffer, source: "email-template", pageCount, sha256, durationMs }`.
- `lib/pipeline/canonical-pdf.ts:47-50` — `isCanonicalPdfSupported()` returns true for `eml`, `msg`.
- `lib/pipeline/process.ts:228-231, 323-328` — calls `buildCanonicalPdf()`, stores under `{caseId}/{docId}/canonical.pdf`.

### Upload + validation

- `app/api/documents/upload/route.ts:17-73` — `getFileTypeInfo()` recognises `.eml` and `.msg`.
- `app/api/documents/upload/route.ts:143-152` — PST explicitly rejected with user guidance to export as EML/MSG.
- `app/api/documents/upload/route.ts:160-183` — `validateFile()` runs magic-byte / corruption / encryption checks.
- `lib/pipeline/file-validator.ts:49-70` — magic signatures include OLE2 (line 61).
- `lib/pipeline/file-validator.ts:96-126` — `expectedMagicTypes()`: `message/rfc822` → no magic check (plain text); `application/vnd.ms-outlook` → expects OLE2.
- `app/requests/[id]/ingest/ingest-client.tsx` — upload UI accept attribute already includes `.eml`, `.msg`.

### Attachments

- `lib/pipeline/email-extract.ts:172-205` — MSG attachments extracted (skips hidden/inline/embedded-MSG).
- `lib/pipeline/extract.ts:265-278` — EML attachments extracted from mailparser.
- `lib/pipeline/email-extract.ts:303-308` — returned in `ExtractionResult.attachments[]`.
- **Gap: `lib/pipeline/process.ts` does not create child Document records from `extraction.attachments`.** Attachments are extracted to memory but discarded after detection-merge.

### NPM packages

- `mailparser@3.9.4` — EML parsing.
- `@kenjiuno/msgreader@1.28.0` — MSG parsing.
- `pdf-lib@1.17.1` — PDF manipulation.
- LibreOffice headless (shell subprocess) — HTML→PDF conversion.

### Gap-fill summary for "full .msg/.eml ingestion"

| Capability | Current state |
|---|---|
| .eml upload + validation | ✓ wired |
| .msg upload + validation | ✓ wired |
| Header + body extraction → pages | ✓ wired |
| Canonical PDF transcript | ✓ wired (HTML→LibreOffice→PDF) |
| Attachment metadata extraction | ✓ wired |
| **Attachments as child Documents** | ✗ missing — REQ-003 deferred to v2 |
| PST | ✗ explicitly rejected at upload |

For Umbra v1, `.eml`/`.msg` ingestion is **substantively complete** — only attachment fan-out (deferred) remains, and PST is intentionally out of scope.

---

## Q5 — Retention / purge mechanics

**Verdict: greenfield.** No TTL, no scheduled cleanup, no admin "Purge Now" anywhere in the codebase. Cascade behaviour is partly correct in the schema but has known orphan paths (AuditEntry, ExportJob, FileUpload, blob storage). No soft-delete columns exist.

### Schema cascade behaviour

- `prisma/schema.prisma:129` — `Document.case` has `onDelete: Cascade`.
- `prisma/schema.prisma:153` — `DocumentPage.document` has `onDelete: Cascade`.
- `prisma/schema.prisma:185` — `Detection.document` has `onDelete: Cascade`.
- `prisma/schema.prisma:250` — `DetectionHistory.detection` has `onDelete: Cascade`.
- `prisma/schema.prisma:284` — `CaseMilestone.case` has `onDelete: Cascade`.
- `prisma/schema.prisma:303` — `CaseAssignment.case`/`milestone` has `onDelete: Cascade`.
- `prisma/schema.prisma:321` — `DetectionSnapshot.document` has `onDelete: Cascade`.
- `prisma/schema.prisma:339` — `FeedbackExample.case` has `onDelete: SetNull` (only).
- `prisma/schema.prisma:211` — **`AuditEntry` has no FK cascade — orphans on case delete.**
- `prisma/schema.prisma:386` — **`ExportJob` has no FK cascade — orphans on case delete.**
- `prisma/schema.prisma:219` — **`FileUpload` has no foreign key — manual cleanup required.**

### Existing delete helpers

- `scripts/smoke-phase1.ts:132` — `safeDelete(prisma, doc.id)` test-cleanup helper.
- `lib/actions/department-actions.ts` — `deleteDepartment()`.
- **No `deleteCase()` / `deleteBatch()` / `purgeCase()` server action anywhere.**
- **No purge-related API route under `app/api/`.**

### Blob storage cleanup

- `lib/storage/azure-blob.ts:78-86` — `delete(key)` calls `deleteIfExists()`.
- `lib/storage/local.ts` — parallel local fs delete.
- **No automation calls these on Case delete.** Blobs leak on case removal.

### Soft-delete patterns

- **None.** No `deletedAt` / `isDeleted` columns anywhere in the schema.

### Audit-chain implications

- `lib/data/audit.ts:28-58` — hash chain is per-case (not global). Each case has its own `previousHash` chain.
- `lib/data/audit.ts:39-59` — integrity hash inputs: `previousHash | timestamp | userId | type | description | target | caseId`.
- Hard-deleting a case wipes the chain. No soft-delete safety net; chain integrity verification (`verifyAuditIntegrity()`) doesn't prevent deletion, just reports breakage post-hoc.

### Settings-side scaffolding (UI only)

- `app/admin/settings/backup-restore.tsx` — displays `retentionDays` value but no backend purge logic.

For Umbra to satisfy REQ-015 (auto-retention) + REQ-016 (Purge Now), the work spans: (1) decide soft-delete vs hard-delete + audit archival; (2) close the AuditEntry/ExportJob/FileUpload orphan paths; (3) blob cleanup integration; (4) scheduled-job runner (none exists today); (5) admin UI.

---

## Q6 — Setup wizard contents

The wizard is at `app/setup/page.tsx` + `app/setup/setup-wizard-client.tsx` (1587 lines). State persists via `SystemSetting` row keyed `setup_wizard_state` (shape: `{ currentStep, completedSteps[], completedAt? }`). Completion is gated by a check in `setup/page.tsx:46` — if `completedAt` is set, redirect to `/`. **There is no middleware-level enforcement** that blocks app access until setup is complete; users can manually navigate to `/requests`, `/admin`, etc.

### The 7 steps

| # | Title | Lines | Captures | Umbra verdict |
|---|---|---|---|---|
| 0 | Organisation Identity | 440-562 | `orgName`, `maoriName`, `abbreviation`, `orgType`, `address`, `phone`, `email`, `website` (via `saveOrgIdentity`) | KEEP |
| 1 | Departments & Teams | 565-727 | Dept CRUD: `name`, `contactEmail`, `headName`; seed-defaults button calls `seedDefaultDepartments()` | MODIFY (keep depts; cut role-escalation hooks) |
| 2 | Document Branding | 730-920 | Signatory name/title/dept; **Ombudsman contact** (4-line address, phone, email); logo upload (POST `/api/logo`); footer text (via `saveOrgBranding`) | MODIFY (keep signatory + logo; remove ombudsman) |
| 3 | LGOIMA Workflow | 923-1015 | Response deadline days, extension max, amber/red thresholds (via `saveLGOIMAConfig`). Hard-coded for 20-day LGOIMA statute. | REMOVE entirely |
| 4 | Detection Policies | 1018-1117 | Confidence thresholds (high/medium percentiles) via `saveDetectionPolicies`. REQ-017 AI tuning. | KEEP |
| 5 | Team Setup | 1120-1324 | User invitations: email, name, role (5-role dropdown), department; calls `inviteUser()` | MODIFY (collapse role dropdown to 2) |
| 6 | Review & Confirm | 1327-end | Section recap with per-step "Edit"; final `completeSetup()` call sets `completedAt` | KEEP |

### Server actions invoked by the wizard

- `lib/actions/setup-actions.ts:15` — `saveOrgIdentity()`.
- `lib/actions/setup-actions.ts:23` — `saveOrgBranding()`.
- `lib/actions/setup-actions.ts:31` — `saveLGOIMAConfig()`.
- `lib/actions/setup-actions.ts:41` — `saveDetectionPolicies()`.
- `lib/actions/setup-actions.ts:49` — `inviteUser()`.
- `lib/actions/setup-actions.ts:76` — `completeSetup()`.
- All gate on `requireAdmin()`.
- `lib/actions/department-actions.ts` — dept CRUD + `seedDefaultDepartments()`.

### Wizard-state machinery

- `lib/data/settings.ts` — `SetupWizardState` shape; `SETTING_KEYS.SETUP_WIZARD_STATE`.
- `lib/data/org-config.ts` — `getSetupWizardState()` / `setSetupWizardState()`.
- `lib/data/settings.ts:8-23` — `SETTING_KEYS` enum includes `ORG_OMBUDSMAN`, `LGOIMA_CONFIG`, `WORKFLOW_CONFIG`, `DETECTION_TOGGLES`, `INSTANCE_CONFIG`, `NOTIFICATION_PREFS`.

### Settings keys to retire/repurpose

- `ORG_OMBUDSMAN` — drop entirely.
- `LGOIMA_CONFIG` — drop or repurpose for generic SLA config.
- `WORKFLOW_CONFIG` (milestone labels, notification rules) — likely drop.
- `DETECTION_TOGGLES`, `INSTANCE_CONFIG`, `NOTIFICATION_PREFS` — keep with edits.

---

## Q7 — Export package machinery

Export pipeline entry: `app/requests/[id]/export/export-client.tsx` (UI) → `app/api/export/[requestId]/generate/route.ts` (API) → `lib/pipeline/export.ts` (orchestrator). Three package types: `requester | internal | ombudsman` (`lib/pipeline/export.ts:24`).

### File-by-file verdict

| File | Lines | Description | Verdict |
|---|---|---|---|
| `lib/pipeline/export.ts` | 659 | ZIP assembly, progress tracking, batch logic, verification report, metadata sanitisation | KEEP (refactor to single-package) |
| `lib/pipeline/cover-letter.ts` | ~150 | LGOIMA cover-letter PDF; calls `getOrgOmbudsman()` (line 41); embeds "Right of Review" boilerplate | DELETE or replace |
| `lib/pipeline/schedule.ts` | 281 | Withholding-schedule PDF: detections grouped by ground+document | KEEP-WITH-MODS (single-column, ground→type rework) |
| `lib/pipeline/chain-of-custody.ts` | 507 | Lifecycle PDF (upload→processing→review→export); generic-ish but explicit "satisfies LGOIMA chain-of-custody requirements" comment at line 8 | KEEP (rename framing) |
| `lib/pipeline/audit-pdf.ts` | ~100 | Audit-trail PDF + integrity-hash badge | KEEP |
| `lib/pipeline/cost-recovery-report.ts` | 422 | Per-document cost breakdown with `COST_RATES`; LGOIMA fee-shifting | DELETE |
| `lib/pipeline/logo-helper.ts` | ~100 | Embed org logo in PDFs (PNG/JPG, 40px max) | KEEP (reusable) |
| `lib/pipeline/redact-pdf.ts` | 906 | **Core redaction engine** (3-tier coordinate / text-search / plain-text fallback) | KEEP (non-negotiable) |
| `lib/pipeline/pdf-fonts.ts` | ~100 | Noto Sans embed (regular/bold/mono), macron support | KEEP (reusable) |
| `lib/pipeline/ai-accuracy-report.ts` | 224 | AI model performance — admin-only | KEEP-OPTIONAL |
| `lib/pipeline/compliance-summary-report.ts` | 224 | Regulatory compliance summary | DELETE |
| `lib/pipeline/reviewer-workload-report.ts` | — | Resource allocation | DELETE |
| `lib/pipeline/redact_pdf_pymupdf.py` | — | PyMuPDF coordinate + text-search redaction | KEEP |
| `lib/pipeline/verify_redaction_pymupdf.py` | — | Post-redaction verification | KEEP |
| `lib/pipeline/sanitise-metadata.ts` | — | PDF metadata stripping | KEEP |

### Reusable helpers (survive even if surrounding file deletes)

- `embedFonts()` from `pdf-fonts.ts` — Noto Sans macron-aware setup.
- `embedOrgLogo()` from `logo-helper.ts` — logo loading + scaling.
- `sanitiseMetadata()` — Office/PDF metadata stripping.
- `assembleZip()` (`export.ts:644-658`) — archiver-based ZIP assembly.
- SHA-256 integrity helper pattern.

### Routes / UI

- `app/api/export/[requestId]/generate/route.ts` — POST → returns `exportId`.
- `app/api/export/[requestId]/[exportId]/status/route.ts` — GET poll.
- `app/api/export/[requestId]/[exportId]/download/route.ts` — GET ZIP.
- `app/api/export/[requestId]/batch-status/route.ts` — multi-export batch poll.
- `app/requests/[id]/export/export-client.tsx:1-122` — package picker + checkbox list + batch toggle + status polling.
- `app/requests/[id]/export/page.tsx` — server component fetching case/doc metadata.
- `prisma/schema.prisma:383-405` — `ExportJob` model. `packageType` defaults `"requester"`. **No FK cascade on case delete.**

For Umbra's "ZIP of redacted PDFs + audit log" target, the scaffolding stays but the package-type matrix collapses to one. Cover-letter, cost-recovery, compliance-summary, reviewer-workload modules drop. Schedule + chain-of-custody + audit-PDF survive with minor framing edits.

---

## Q8 — Test inventory

### Vitest unit tests (38 files in `lib/**/__tests__/`, `components/**/__tests__/`, `app/**/__tests__/`, `tests/`)

**KEEP — pipeline core (16):**
- `lib/pipeline/__tests__/ai-detect.test.ts`
- `lib/pipeline/__tests__/patterns.test.ts`
- `lib/pipeline/__tests__/doc-classify.test.ts`
- `lib/pipeline/__tests__/bbox.test.ts`
- `lib/pipeline/__tests__/canonical-pdf.test.ts`
- `lib/pipeline/__tests__/canonical-pdf.integration.test.ts`
- `lib/pipeline/__tests__/duplicate-detect.test.ts`
- `lib/pipeline/__tests__/email-to-pdf.test.ts`
- `lib/pipeline/__tests__/section-marker-detect.test.ts`
- `lib/pipeline/__tests__/label-adjacent.test.ts`
- `lib/pipeline/__tests__/entity-propagation.test.ts`
- `lib/pipeline/__tests__/redact-dedup.test.ts`
- `lib/pipeline/__tests__/rebuild-content.test.ts`
- `lib/pipeline/__tests__/zero-bbox-fixes.test.ts`
- `lib/pipeline/__tests__/content-builder.test.ts`
- `lib/pipeline/__tests__/pdf-fonts.test.ts`

**KEEP — storage/auth/utility (8):**
- `lib/storage/__tests__/local.test.ts`
- `lib/auth/__tests__/authorize.test.ts` (LGOIMA-role assertions need re-shape)
- `lib/auth/__tests__/session.test.ts`
- `lib/data/__tests__/audit.test.ts`
- `lib/data/__tests__/settings.test.ts`
- `lib/__tests__/utils.test.ts`
- `lib/__tests__/rate-limit.test.ts`

**KEEP — bench (3):**
- `lib/bench/__tests__/pathways.test.ts`
- `lib/bench/__tests__/pipeline-invoker.test.ts`
- `lib/bench/__tests__/scoring.test.ts`

**KEEP — components (6):**
- `components/layout/__tests__/nav-sidebar-collapse-context.test.ts`
- `components/review/__tests__/manual-detection-popover.test.ts`
- `components/review/__tests__/pdf-detection-overlay.test.ts`
- `components/review/__tests__/pdf-redaction-preview-overlay.test.ts`
- `components/review/__tests__/pdf-viewer-dual-panel.test.ts`
- `components/review/__tests__/pdf-viewer-worker.test.ts`

**KEEP — page-level review (3):**
- `app/requests/[id]/review/[docId]/__tests__/routing-and-banner.test.ts`
- `app/requests/[id]/review/[docId]/__tests__/sidebar-keyboard.test.ts`
- `app/requests/[id]/review/[docId]/__tests__/sidebar-zero-bbox-badge.test.ts`

**KEEP — performance + API (2):**
- `tests/benchmarks/performance.test.ts`
- `app/api/documents/[docId]/rebuild-canonical/__tests__/route.test.ts`

**KEEP-WITH-MODS — actions/validation (4):**
- `lib/actions/__tests__/bulk-accept-detections.test.ts`
- `lib/actions/__tests__/extend-deadline.test.ts` (LGOIMA s14 reference; remove or repurpose)
- `lib/actions/__tests__/manual-detection-bbox.test.ts`
- `lib/validation/__tests__/schemas.test.ts` (validates LGOIMA ground IDs)

**DELETE / REPLACE — LGOIMA-specific (3):**
- `lib/__tests__/lgoima-grounds.test.ts`
- `lib/__tests__/detection-type-grounds.test.ts` (redo for Umbra type set)
- `lib/pipeline/__tests__/schedule.test.ts`

### Playwright e2e tests (56 files in `e2e/`)

**KEEP — auth, navigation, profile, audit, API health (12):**
- `e2e/activation/activate.spec.ts`
- `e2e/auth/login.spec.ts`
- `e2e/auth/rbac.spec.ts` (role matrix shrinks to 2)
- `e2e/landing/landing-page.spec.ts`
- `e2e/navigation/not-found.spec.ts`
- `e2e/navigation/sidebar.spec.ts`
- `e2e/navigation/breadcrumbs.spec.ts`
- `e2e/navigation/notifications.spec.ts`
- `e2e/profile/profile.spec.ts`
- `e2e/profile/profile-save.spec.ts`
- `e2e/audit/audit-trail.spec.ts`
- `e2e/api/health.spec.ts`, `e2e/api/documents.spec.ts`, `e2e/api/notifications.spec.ts`, `e2e/api/scim.spec.ts`, `e2e/api/demo-request.spec.ts`

**KEEP-WITH-MODS — case (→ batch) lifecycle, documents, review, canonical-pdf (16):**
- `e2e/cases/create-case.spec.ts` + `create-case-e2e.spec.ts` + `create-case-validation.spec.ts`
- `e2e/cases/case-list.spec.ts`
- `e2e/cases/case-detail.spec.ts` (`requesterType`, `reference` reshape)
- `e2e/cases/case-search-filter.spec.ts`
- `e2e/cases/error-boundary.spec.ts`
- `e2e/cases/pipeline.spec.ts` (milestone semantics drop)
- `e2e/cases/qa.spec.ts` (sign-off rework)
- `e2e/documents/ingest.spec.ts`, `upload-authz.spec.ts`
- `e2e/review/review-document.spec.ts`, `review-actions.spec.ts`, `bulk-actions.spec.ts`, `bulk-review.spec.ts`, `version-compare.spec.ts`
- `e2e/canonical-pdf/build.spec.ts`
- `e2e/queue/review-queue.spec.ts`

**KEEP-WITH-MODS — admin pages (10):** `admin-settings`, `settings-save`, `detection-settings`, `custom-rules`, `ai-governance`, `integrations`, `notification-settings`, `user-invitation`, `system-health`, `workflow-settings` (workflow stages collapse).

**KEEP-WITH-MODS — setup (1):** `e2e/setup/setup-wizard.spec.ts` (LGOIMA step + role dropdown rework).

**KEEP — dashboard (1):** `e2e/dashboard/dashboard.spec.ts`.

**KEEP — visual regression (1):** `e2e/screenshot-audit.spec.ts`.

**DELETE — LGOIMA-specific export/schedule/reports (4):**
- `e2e/cases/schedule.spec.ts` (s6/s7/ombudsman)
- `e2e/export/export-actions.spec.ts` (ombudsman + cover-letter + chain-of-custody flow)
- `e2e/export/export-package.spec.ts`
- `e2e/api/export.spec.ts` (packageType enum incl. "ombudsman")
- `e2e/reports/reports.spec.ts` (withholding-schedule, compliance-summary, cost-recovery)

---

## Q9 — Admin surface

`app/admin/` has three top-level pages: `/admin/settings`, `/admin/rules`, `/admin/ai-governance`. All gate on `middleware.ts:51` (`adminRoles` includes 4 roles). Settings is the primary hub (5 tabs, biggest footprint).

### `/admin/settings` (`app/admin/settings/page.tsx` + `settings-client.tsx`)

Six tabs surfaced in `settings-client.tsx`:

1. **Organisation** — org identity form, dept CRUD, user table with inline role editor (5-role dropdown). **KEEP** (collapse role dropdown to 2).
2. **Detection** — per-type AI toggles (the `DEFAULT_DETECTION_TOGGLES` list). **KEEP**.
3. **Workflow** — milestone labels, notification recipient rules. **DROP**.
4. **Integrations** — M365, Records Management, eDiscovery configs. **DROP** for v1 (no requirement).
5. **Backup** — `app/admin/settings/backup-restore.tsx` — schedule, retention, history table. **KEEP simplified** (also the lever for REQ-015 retention if tied to purge job).
6. **System Health** — circuit-breaker dashboard. **KEEP**.

Server actions: `lib/actions/settings-actions.ts:13-50` — 5 mutations (`saveOrgIdentity`, `saveDetectionToggles`, `saveWorkflowConfig`, `saveNotificationPrefs`, `saveLGOIMAWarningThresholds`). All `requireAdmin()`.

Data: `lib/data/settings.ts` (`SETTING_KEYS` enum, CRUD); `lib/data/backup-restore.ts`; `lib/data/org-config.ts`.

### `/admin/rules` (`app/admin/rules/page.tsx` + `rules-client.tsx`)

Custom-rule CRUD: name, type (Keyword/Pattern/Entity/Combination), match mode (Exact/Fuzzy/Regex), priority, scope, status, suggested LGOIMA ground. Bulk activate/deactivate/delete.

Actions: `lib/actions/rule-actions.ts` (6 mutations). Data: `lib/data/rules.ts`.

**Verdict:** OPTIONAL for v1. If kept, suggested-ground field must be re-keyed off Umbra's grounds (or removed). If dropped, also drop the e2e and the rule schema from prisma.

### `/admin/ai-governance` (`app/admin/ai-governance/page.tsx` + `ai-governance-client.tsx`)

True/false-positive/false-negative rates, feedback-loop status, model deployment info.

Data: `lib/data/ai-metrics.ts`, `lib/pipeline/feedback-examples.ts`.

**Verdict:** OPTIONAL for v1 (useful for redaction-quality QA; not on the "must-have" list).

### Other admin-adjacent surfaces

- `/reports` — referenced from sidebar (`components/layout/sidebar.tsx:21`); read-only LGOIMA reports (compliance, withholding-schedule, cost-recovery, ai-accuracy, reviewer-workload). **DROP all but ai-accuracy** for Umbra.
- `app/api/scim/Users/`, `app/api/scim/Groups/` — SCIM provisioning. Group list (`Groups/route.ts:24-27`) hard-codes 4 role groups; trim to 2.
- No `/admin/users` separate page — user mgmt lives inside Settings → Organisation tab.
- No `/admin/audit` page — audit log lives at `app/requests/[id]/audit/page.tsx` (per-case scope). Umbra's "audit log download" requirement may want a dedicated admin-level page.
- No "Purge Now" UI exists today. Greenfield.

### Required net-new admin work in Umbra

- Retention setting UI (REQ-015) — the Backup tab's `retentionDays` field is display-only; would need to wire to a real purge worker.
- Purge-Now control (REQ-016) — no precedent in code.
- Audit-log download (cross-batch) — exists per-case but not aggregated.

---

## Q10 — Hidden gotchas

### Hard-coded LGOIMA strings (file/line counts as recorded by survey agents)

- `README.md` (~40 LGOIMA refs), `DEVELOPER-NOTES.md` (~17), `CLAUDE.md` (~13). Pure docs but they will rot.
- `prisma/seed.ts` (~37 refs) — fixture data with PNCC, LGOIMA-YYYY refs, Featherston Street cases.
- `e2e/fixtures/test-data.ts` (~10 refs) — same.
- `lib/lgoima-grounds.ts:1-137` — 27-ground taxonomy. Imported by `lib/validation/schemas.ts` Zod schema; **any ground ID outside this set fails validation**.
- `lib/validation/schemas.ts:21-31` — `validGroundIds` Set built from `lgoimaGrounds.flatMap()`. **Hot path for detection mutations.**
- `lib/data/settings.ts:208-236` — `OrgOmbudsman` interface + LGOIMA defaults (20-day deadline, 40-day extension max).
- `lib/pipeline/cover-letter.ts:41` — `getOrgOmbudsman()` called unconditionally at PDF render time.
- `lib/pipeline/chain-of-custody.ts:8` — explicit "satisfies LGOIMA chain-of-custody" comment.
- `lib/pipeline/cost-recovery-report.ts` — fee-shifting boilerplate.
- `app/setup/setup-wizard-client.tsx` — Step 3 hard-codes 20-day statute; signatory block displays "Office of the Ombudsman" defaults.

### Schema and enum-like constraints

- `prisma/schema.prisma:50-78` (Case) — string fields, no enum constraints (good).
- `prisma/schema.prisma:160-192` (Detection) — `type`, `suggestedGround`, `appliedGround` are free-form strings; constrained only by Zod at the application layer.
- `prisma/schema.prisma:299` (CaseAssignment.role) — string with no enum but values constrained to `lead-reviewer | sme-reviewer | senior-reviewer | final-approver` by app-side logic.
- `prisma/schema.prisma:383-405` (ExportJob.packageType) — string defaulting to `"requester"`; values include `"ombudsman"` in code paths.
- `prisma/schema.prisma:275-290` (CaseMilestone.stage) — string with no enum but app-side values: `collection | processing | initial-review | senior-review | final-approval | release`.

### Audit-hash dependencies

- `lib/data/audit.ts:28-58` — hash chain inputs are `previousHash | timestamp | userId | type | description | target | caseId`. Per-case scope; not global.
- Event-type strings in `type` column are pipeline-emitted (e.g. `document_processed`, `duplicate_detected`) and generic; some workflow actions emit LGOIMA-flavoured types in audit history, but these are recorded as opaque strings. Migration risk is low for the hash itself, moderate for any UI that pretty-prints these types.
- `lib/pipeline/audit-pdf.ts:15` — calls `verifyAuditIntegrity()` which is per-case.
- `CLAUDE.md` flags a known timestamp-storage gotcha around timezone re-interpretation; same applies in Umbra and is unrelated to LGOIMA but worth re-testing.

### Middleware quirks

- `middleware.ts:50-53` — admin gate on 4 hard-coded roles.
- `middleware.ts:26-39` — public path allow-list. Includes `/api/activation-status`, `/api/demo-request`, `/manifest.json`, `/sw.js`, `/offline.html`. **No setup-wizard gate** — first-run users could navigate around the wizard if they bypass `/setup`.
- `middleware.ts:48-53` — `/admin/*` gate is currently the only role-based redirect.

### Env validation & build-time

- `lib/config/env.ts:1-201` — generic. Azure OpenAI/DI required vars; no LGOIMA-specific env. Build-phase skip honoured (`NEXT_PHASE === phase-production-build`). **No surprises here.**
- `next.config.ts` — no LGOIMA bake-ins.
- `Dockerfile` — generic.
- `prisma.config.ts` — generic.

### Activation flow

- `/activate` — first-admin code-based flow. Generic-looking; not LGOIMA-coupled.

### Email/SMTP templates

- `lib/email/templates.ts:24-58` — invitation email references "Veil" product name but no LGOIMA wording.

### Detection-type ↔ ground coupling (silent-failure risk)

- `lib/detection-type-grounds.ts` plus the Zod `validGroundIds` set form a tight pair. Renaming a detection type without updating both produces a silent failure: type-change actions populate `appliedGround = ""` which then fails validation. A parity test is missing.

### Workflow stage assumptions scattered across files

- `middleware.ts:50` (admin role list)
- `lib/auth/authorize.ts:13-17, 130-140` (privileged set + requireAdmin)
- `lib/auth/auth.config.ts:67` (admin roles in JWT-aware config)
- `prisma/schema.prisma:299` (CaseAssignment.role)
- `app/admin/settings/workflow-settings.spec.ts` + `e2e/admin/workflow-settings.spec.ts` (UI toggles)
- `app/setup/setup-wizard-client.tsx` (role dropdown, milestone labels)
- `lib/data/pipeline.ts:11-18` (ROLE_FOR_STAGE map)
- `prisma/seed.ts` (creates 5-role users)

Touching only one of these will leave the others inconsistent. **This is the biggest hidden time-sink in the rework** — estimate 2-3 days to audit/parameterise.

### Documentation drift

- `docs/` has 22 directly-named LGOIMA artefacts (e.g. `lgoima-redaction-taxonomy.md`, `lgoima-act-2026-01-15.pdf`, `lgoima-remediation-plan.md`). Need archival decision: keep for historical reference, or delete on fork.
- `requirements-traceability.md` is REQ-keyed against the original NPDC RFP P26-138 — supersede with a Umbra-keyed version.

### Per-case scope assumption in audit + integrity

- The hash chain is per-case (good for data isolation). But cross-case features (e.g. an "audit log of all batches" admin page) cannot show a global integrity badge — would need to verify each chain independently and report N statuses. UI design point, not a blocker.

### Storage layout

- Storage keys are organised under `{caseId}/{docId}/...`. Renaming Case → Batch is a code-only rename; existing blob paths remain `{caseId}/...` unless data is migrated. For greenfield deployments this is moot.

---

## Bottom line for scoping

The codebase has done a better job than expected of keeping `String` columns un-constrained at the DB layer (detection type, ground, role, package type, milestone stage are all free-form strings). The constraint enforcement lives at the application layer, mostly in Zod schemas (`lib/validation/schemas.ts`) and in literal-string lists across middleware/auth/UI. **That's the surface area to retarget.**

The pieces that are genuinely greenfield (not just renames or list-trims) are: retention/purge worker, attachment fan-out for emails, single-package export. Everything else is a coupling-removal exercise plus a Zod-vocabulary swap.
