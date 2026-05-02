# Umbra — Architecture Overview

**Version:** 1.0 (Phase 9 baseline)
**Status:** Pre-deploy. Phase 11 will publish.

This document is the entry point for the Umbra architecture. It replaces
the seven-document Veil-era set (now archived under
`docs/legacy-veil/architecture/`). Read this first; deeper detail lives
in code comments and inline docs in the phase-by-phase rework history at
[`docs/umbra-implementation-plan.md`](../umbra-implementation-plan.md).

---

## 1. System overview

Umbra is a single-tenant web application that:

1. Accepts uploaded documents (PDF, DOCX, XLSX, EML, MSG, TXT) into
   per-batch storage.
2. Extracts text + page layout via Azure Document Intelligence
   `prebuilt-read` (OCR for scanned PDFs and images).
3. Runs three detection sources in parallel — regex patterns
   (NZ-specific PII), Azure OpenAI GPT-4o (contextual / governance
   categories), and admin-defined custom rules.
4. Computes per-line bboxes for matched text, deduplicates by
   `(page, type, text, posY_rounded)`, persists detections to Postgres.
5. Presents a dual-pane review UI (PDF on left, detection list on
   right). Reviewer accepts / rejects each finding.
6. Admin signs off the batch. The export pipeline produces a single
   ZIP: redacted PDFs (true PyMuPDF redaction), redaction schedule,
   audit timeline, audit log (CSV + PDF), manifest.
7. Soft-delete + 7-day grace window. The hourly retention worker
   archives the audit chain to immutable blob storage and
   cascade-deletes the batch.

## 2. Component diagram (logical)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (admin / reviewer)                    │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │ HTTPS
┌──────────────────────────────────────▼───────────────────────────────┐
│                    Next.js 15 server (App Router)                    │
│ ┌────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│ │   Pages    │  │ Server actions│  │  API routes (REST)           │  │
│ │ (server    │  │  (mutations)  │  │  /api/upload, /api/process,  │  │
│ │  components)│  │               │  │  /api/export/..., /api/admin │  │
│ └─────┬──────┘  └──────┬───────┘  └────────────┬─────────────────┘  │
│       │                │                       │                     │
│       └────────────────┼───────────────────────┘                     │
│                        │                                              │
│  ┌─────────────────────▼─────────────────────────────────────────┐   │
│  │  lib/data/  (Prisma queries)                                   │   │
│  │  lib/actions/ (mutations + audit-trail wrappers)               │   │
│  │  lib/auth/ (NextAuth v5 + Azure AD + role-based authz)         │   │
│  │  lib/pipeline/ (extraction, detection, redaction, PDF gen)     │   │
│  │  lib/jobs/ (pg-boss runner + audit-archive)                    │   │
│  │  lib/storage/ (provider abstraction)                           │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │
        ┌──────────────────────────────┼─────────────────────────────────┐
        │                              │                                  │
┌───────▼────────┐   ┌─────────────────▼───────────────┐  ┌──────────────▼─────┐
│  PostgreSQL    │   │   Azure OpenAI (GPT-4o)          │  │  Azure Blob        │
│  16 + Prisma 7 │   │   Azure Document Intelligence    │  │  Storage           │
│  (umbra DB +   │   │     (prebuilt-read OCR)          │  │  (documents +      │
│   pgboss schema)│  │                                  │  │   archives)        │
└────────────────┘   └──────────────────────────────────┘  └────────────────────┘
        │
┌───────▼────────────┐
│ PyMuPDF subprocess │
│  (Python3, true    │
│   PDF redaction)   │
└────────────────────┘
```

## 3. Data model (14 Prisma models)

### Core

- **User** — admin or reviewer; SSO-linked (`azureAdOid`) or credentials.
- **Batch** — the unit of work. Holds soft-delete + retention state
  (`deletedAt`, `purgeScheduledAt`, `purgedAt`, `purgeStatus`).
- **Document** — one per uploaded file; tied to a Batch via `batchId`.
- **DocumentPage** — per-page extracted text + layout JSON.
- **Detection** — one per finding. Carries type, text, confidence,
  bbox, status (pending / accepted / rejected), reasoning, free-form
  reviewer note.
- **DetectionHistory** — append-only audit of detection state changes.

### Audit

- **AuditEntry** — every action of consequence. SHA-256 hash chain via
  `previousHash` / `integrityHash`, scoped per batch.
- **PurgeLog** — survives Batch cascade-delete (no FK by design).
  One row per purged batch, written by the retention worker.

### Settings + setup

- **SystemSetting** — key-value, JSON-typed, for org identity / branding
  / detection toggles / retention config / setup-wizard state.
- **CustomRule** — admin-defined keyword / pattern / regex detection
  rules with optional reviewer note.
- **ActivationCode** — first-run admin activation flow.
- **UserInvitation** — pending team invites.
- **BatchMilestone** — three-stage tracking: upload, review, export.
- **ExportJob** — per-export-attempt status row (pending → generating →
  verifying → complete / error).
- **FileUpload** — temporary chunked-upload receipts.

## 4. Auth + role model

- NextAuth v5. Two providers: Azure AD (primary, prod) and Credentials
  (dev / fallback).
- Two roles: **admin** and **reviewer**. The role is on `User.role` and
  is re-read from the database in every authorisation check —
  `requireUser`, `requireAdmin`, `authorizeForBatch`,
  `authorizeForDocument`, `authorizeForDetection`.
- Per-batch scoping is supported (admin can scope a reviewer to specific
  batches via assignments) but there is no department graph.
- First-run flow: a fresh deployment hands the first admin a setup
  wizard. The wizard's 5 steps cover org identity, document branding,
  detection policies, team invites, and a review summary. The wizard
  state lives in `SystemSetting.setup_wizard_state`.

## 5. Detection pipeline

In `lib/pipeline/process.ts`:

1. **Validation + format conversion** — `lib/pipeline/extract.ts`.
   Mammoth for DOCX, ExceljS for XLSX, MSG-reader for MSG, mailparser
   for EML, pdf.js for PDF. Output: an array of `ExtractedPage`.
2. **OCR** — for image-based PDFs Azure DI `prebuilt-read` runs on the
   binary; output is folded back into the page array as
   `DocumentPage.layoutJson` (used later for bbox calculation).
3. **Document classification** — single GPT-4o call with the full
   document text; classifies type + content flags + jurisdictional
   context. Output drives the AI prompt's contextual hints.
4. **Pattern matching** — `lib/pipeline/patterns.ts`. NZ-specific
   regexes for IRD, NHI, phone, email, address, bank account,
   passport, driver licence (with I/O exclusion + context-word guard),
   vehicle reg.
5. **Label-adjacent detection** — `lib/pipeline/label-adjacent.ts`.
   Looks for labelled fields ("Date of birth: ...", "DOB | ...") to
   catch values that don't match a regex but are explicitly labelled.
6. **Section-marker detection** — `lib/pipeline/section-marker-detect.ts`.
   Identifies labelled "candid commentary" / "free and frank" sections
   and flags every sentence inside as `free-frank`.
7. **AI detection** — `lib/pipeline/ai-detect.ts`. Pages chunked into
   3-page batches with doc-level context; concurrent calls (max 8)
   with circuit-breaker on 429s. Output: per-page detections with
   confidence + reasoning.
8. **Custom rules** — `lib/pipeline/custom-rules.ts`. Active rules
   from `CustomRule`; keyword (Exact / Fuzzy) and Regex modes.
9. **Entity propagation** — `lib/pipeline/entity-propagation.ts`.
   Personal-name and harassment-risk seeds generate variants
   (full-name, honorific+surname, bare-surname) and the document text
   is searched for non-overlapping occurrences.
10. **Bbox enrichment** — per-line bboxes from Azure DI's word
    polygons; >80-char text short-circuits (see "long narrative" handling
    below).
11. **Cross-source dedup** — by `(page, type, text, posY_rounded)`.
    Section-marker detections use `(page, type, text, "section-marker")`
    instead.
12. **Persistence** — `Detection` rows + content JSON for the review UI.

## 6. Redaction pipeline

In `lib/pipeline/redact-pdf.ts` + `redact_pdf_pymupdf.py`:

| Tier | When | How |
|---|---|---|
| 1 | PDF originals with non-zero bboxes | PyMuPDF `add_redact_annot` at the bbox coordinates, `apply_redactions()` |
| 2 | DOCX/XLSX/TXT (after LibreOffice → PDF) and Tier-1 fallback | PyMuPDF `page.search_for(text)` over every page |
| 3 | Last resort | `generateTextPdf` — text-based PDF with `[REDACTED]` placeholders |

A spatial dedup runs before Tier 1 to collapse overlapping / contained
detection bboxes — the dedup output is one rect per spatial cluster.

The export route runs a post-redaction verification (search the
redacted PDF for the redaction strings; warn on any leak).

## 7. Retention worker (Phase 6)

pg-boss 12.x manages its own `pgboss` schema inside the Umbra DB.
`instrumentation.ts:register()` calls `startWorker()` on Next.js server
boot.

### Hourly retention sweep

1. `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 10` claims any batch whose
   `purgeScheduledAt <= NOW() AND purgeStatus IS NULL` in a
   transaction.
2. `UPDATE batches SET purgeStatus = 'purging' WHERE id = ANY(...)`,
   commit. Rows are now claimed and visible to other workers as
   purging.
3. For each claimed batch: `archiveAuditChain` writes the four
   artefacts under `archives/{YYYY}/{batchId}/`, roundtrip-verifies,
   `prisma.batch.delete` cascades, `storage.listByPrefix("{batchId}/")`
   cleans up data blobs, `prisma.purgeLog.create` records the archive.
4. **Auto-retention pass** at the tail: soft-deletes
   `status=exported` batches whose `updatedAt` is older than
   `retentionDaysAfterCompletion`.

### On-demand purge-batch

Admin clicks Purge Now → `purgeNowBatch` action → enqueues a
`purge-batch` pg-boss job with `{ batchId, requestedBy, reason,
skipGrace }`. Same archive + cascade + cleanup + PurgeLog sequence.

### Failure semantics

A failure between claim and PurgeLog write leaves
`purgeStatus='purging'` on the batch. The next sweep tick won't
re-claim (filter excludes `purgeStatus IS NOT NULL`). Operator
follow-up required.

## 8. Audit chain integrity

`AuditEntry` carries a per-batch SHA-256 hash chain:

```
hash = SHA-256(previousHash | timestamp | userId | type | description | target | batchId)
```

`createAuditEntry` writes the row inside a serialisable transaction
that reads the previous hash and writes the new entry atomically —
preventing two concurrent writes from racing on the same
`previousHash`.

`verifyAuditIntegrity(batchId)` walks the chain. Uses raw SQL with
`to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` so the
timestamp string is byte-identical to what was hashed at insert time
(the `pg` driver's local-TZ re-interpretation otherwise breaks
verification). The same pattern is used in
`lib/jobs/audit-archive.ts:loadCanonicalEntries`.

The export route refuses to generate when `verifyAuditIntegrity`
returns invalid — the chain is the trust anchor and a tamper would
poison every downstream artefact.

## 9. Storage abstraction

`StorageProvider` (`lib/storage/types.ts`) is a six-method interface:
`upload, download, getUrl, delete, exists, listByPrefix`.

- `lib/storage/local.ts` — filesystem under `./uploads/` (dev). Path
  traversal guard on `resolvePath`.
- `lib/storage/azure-blob.ts` — Azure Blob Storage. Single container
  (default `umbra-documents`). Container auto-created on first use.

`lib/storage/index.ts` chooses based on
`AZURE_STORAGE_CONNECTION_STRING` presence.

Blob layout:

```
{batchId}/<original/canonical/redacted/...>     per-batch document data
exports/{batchId}/{exportId}/{filename}.zip     export packages
archives/{YYYY}/{batchId}/...                   audit archives (immutable)
logos/<key>.png                                 org logo
```

The retention worker cleans up `{batchId}/` on cascade-delete but
**never** touches `archives/...`.

## 10. Deployment (Phase 11 target)

- Resource group `rg-umbra-prototype` in NZ North.
- ACR `acrumbraprototype`, App Service Linux B1 (`app-umbra-prototype`),
  PostgreSQL Flexible Server `psql-umbra-prototype`, Storage Account
  `stumbraprototype` (containers: `umbra-documents`, `archives`,
  `backups`), Key Vault `kv-umbra-prototype`, Application Insights.
- Azure OpenAI + Azure DI: NZ North if GA, else Australia East with a
  cross-region private endpoint (Phase 0 decision).
- App Service "Always On" = true so the in-process pg-boss worker
  doesn't sleep.

## 11. Out-of-scope (intentional)

- LGOIMA grounds + public-interest tests (Veil's territory).
- Department / case-assignment workflow.
- Multi-tenant SCIM provisioning.
- Configurable workflow stages.
- Reporting beyond AI accuracy + audit timeline + cross-batch archive
  download.

## 12. Reading further

- [`02-azure-infrastructure.md`](./02-azure-infrastructure.md) — Phase 11
  will replace the archived Veil version with a fresh Umbra version.
- [`docs/umbra-implementation-plan.md`](../umbra-implementation-plan.md) —
  full 11-phase rework programme.
- [`docs/umbra-current-state-survey.md`](../umbra-current-state-survey.md) —
  what the codebase looked like at fork time.
- `docs/legacy-veil/architecture/` — the Veil-era specs (kept for
  traceability).
