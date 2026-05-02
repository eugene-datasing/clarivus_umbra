# Changelog

All notable changes to Umbra. The Veil-era changelog covering work prior
to the `v0.0.0-umbra-fork` tag is preserved at
`docs/legacy-veil/changelog-veil.md` (or in the git history of the
predecessor repo `DataSing/clarivus_veil`).

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/);
each phase from the rework programme has its own section.

---

## 2026-05-02 — Phase 9: branding + docs cleanup

### Changed
- Top-level docs (`README.md`, `CLAUDE.md`, `DEVELOPER-NOTES.md`) rewritten
  for Umbra. Veil branding stripped from the codebase except where it
  appears as historical context (this file, `SECURITY-NOTES.md`,
  `docs/umbra-*`).
- `prisma/seed.ts` — replaced PNCC + LGOIMA seed scenario with the
  fictional **Ministry of Demo**: 1 admin, 3 reviewers, 3 sample Batches.
- Email templates (`lib/email/templates.ts`) — Veil → Umbra.
- App layout title and footer — Umbra wordmark, neutral palette
  (placeholder visual branding per Amendment A7).
- `docker-compose.yml` — env vars updated to `umbra` user/db. Container
  name follows the directory until Phase 11 recreates it.
- `.env.example` added with the canonical dev `DATABASE_URL` and the full
  required env-var set.

### Archived
- LGOIMA-specific specs (`lgoima-*.md`, `lgoima-act-*.pdf`,
  `lgoima-redaction-taxonomy.md`) moved to `docs/legacy-veil/`.
- Veil-era architecture docs (`docs/architecture/01-07*.md`),
  `api-reference.md`, `auth-and-onboarding-spec.md`,
  `azure-infrastructure-spec.md`, `client-deployment-activation-spec.md`,
  `requirements-traceability.md`, `remediation-2026-04.md`, and the
  harassment-risk spike folder all moved to `docs/legacy-veil/`.

### Removed
- Two pre-fork session-handoff documents
  (`docs/session-handoff-2026-04-{19,21}.md`).

### Added
- `docs/architecture/01-umbra-overview.md` — fresh Umbra architecture
  overview.
- `docs/requirements-traceability.md` — slim Umbra REQ-keyed traceability.

---

## 2026-05-02 — Phase 8: setup wizard slim + custom rules + admin wire

### Changed
- Setup wizard slimmed from 7 steps (Veil) to 5 (Umbra): Org Identity,
  Document Branding (no Ombudsman block), Detection Policies, Team Setup,
  Review.
- `CustomRule.suggestedGround` replaced with `note: String?` — schema +
  actions + UI + validation. Auto-suggested rules from manual detections
  no longer write the ground hint.
- Admin Settings → Backup tab gains a Retention & Audit Archive panel
  showing Trash count, last-archive timestamp, archived-total, plus a
  Download Audit Archive (ZIP) button hitting the Phase-6c endpoint.
- AI governance copy de-LGOIMA'd (one-line fix).

### Removed
- `saveLGOIMAConfig`, `markDepartmentsStepCompleted` actions.

---

## 2026-05-02 — Phase 6c: real retention worker + cross-batch download

### Added
- `lib/jobs/audit-archive.ts` — canonical-JSONL serialiser, RFC-4180 CSV
  mirror, integrity verifier, roundtrip-verifying archiver. Per-batch
  artefacts under `archives/{YYYY}/{batchId}/` (jsonl, csv,
  integrity.json, manifest.json).
- Real `purge-batch` and `retention-sweep` pg-boss handlers (replacing
  Phase 6a placeholders): claim via `SELECT ... FOR UPDATE SKIP LOCKED`,
  archive + verify, cascade-delete, blob cleanup, `PurgeLog` insert.
- Auto-retention sweep — soft-deletes `status=exported` batches past
  their retention window.
- `GET /api/admin/audit-archive/download` — admin-gated cross-batch ZIP
  download. Re-verifies every chain at download time and writes a
  top-level `verification-summary.json`.
- `StorageProvider.listByPrefix(prefix)` added to the storage abstraction
  with implementations for both local and Azure Blob.

---

## 2026-05-02 — Phase 6a + 6b: scaffolding + soft-delete + admin UI

### Added
- `PurgeLog` model — survives `Batch` cascade-delete (no FK by design).
  Phase 6c writes one row per purged batch.
- pg-boss 12.x dependency. `lib/jobs/runner.ts` owns the singleton
  instance + `purge-batch` and `retention-sweep` queues. `instrumentation.ts`
  starts the worker on server boot (best-effort).
- Soft-delete actions: `softDeleteBatch`, `restoreBatch`, `purgeNowBatch`
  (`{ skipGrace?, reason? }` — reason required when skip-grace).
- Admin Retention page at `/admin/retention` with config form, Trash
  table, and Purge History.
- `RETENTION_CONFIG` setting (14d retention / 7d grace / auto-enabled).
- Per-batch Delete button on the batches list (admin only).

### Removed
- `lib/queue/job-queue.ts` (Phase 4 carry-over). `app/api/documents/
  {[docId]/process,queue-status}/route.ts` refactored to read
  `Document.status` directly.

---

## 2026-05-02 — Phase 7: export simplification

### Changed
- Export collapsed from a packageType tri-state (requester / internal /
  ombudsman) to a single ZIP layout. Drops the `documentIds` /
  `batchGroupId` / `batchNumber` fields from `ExportJob`.
- `lib/pipeline/schedule.ts` → `redaction-schedule.ts` — regrouped by
  detection type, never includes the redacted text (Amendment A4
  no-leakage rule).
- `lib/pipeline/chain-of-custody.ts` → `audit-timeline.ts` — generic
  per-document handling timeline; LGOIMA framing dropped.
- `lib/pipeline/zip.ts` extracted from `export.ts` for Phase 6 reuse.

### Removed
- `cover-letter.ts`, `cost-recovery-report.ts`,
  `compliance-summary-report.ts`, `reviewer-workload-report.ts` and
  their corresponding `/api/reports/...` routes.
- `app/api/schedule/[batchId]/route.ts` (the schedule survives only in
  the export ZIP).

---

## 2026-05-02 — Phase 5: detection-field cleanup + nz-driver-licence

### Changed
- Detection model dropped `suggestedGround`, `appliedGround`, and
  `piConsideration`. Status-only collapse on the review path; bulk
  variants renamed to `bulkAcceptBySimilar` / `bulkAcceptByType`.
- `driver-licence` → `nz-driver-licence` across all 22 detection types.
- Redaction engine drops ground-priority dedup and ground labels.
- Added a parity test (`lib/__tests__/detection-type-parity.test.ts`)
  locking the detection-type vocabulary across every plumbing point.

### Removed
- `applyGround`, `bulkApplyGroundToSimilar`, `bulkApplyGroundByType`
  actions; `version-snapshot.ts` and `snapshot-diff.ts` (snapshot model
  was dropped in Phase 2).

---

## 2026-04 to 2026-05 — Earlier phases

- **Phase 4**: workflow simplification (drop Veil's milestone pipeline /
  pipeline route / SCIM / departments). `Case` → `Batch`, `caseId` →
  `batchId` across the FK graph.
- **Phase 3**: roles collapse — admin / request-manager / senior-reviewer /
  final-approver / reviewer → admin / reviewer.
- **Phase 2**: schema reboot. 19-model Veil schema → 14-model Umbra
  `0001_init`. Added soft-delete + retention columns to `Batch`.
- **Phase 1**: rebrand. `package.json` rename, GitHub remote pointed at
  `DataSing/clarivus_umbra`, `v0.0.0-umbra-fork` tag created.
- **Phase 0**: pre-flight, decision-gate alignment, current-state survey.

For Veil-era history (2024 → April 2026) consult the predecessor repo
`DataSing/clarivus_veil`.
