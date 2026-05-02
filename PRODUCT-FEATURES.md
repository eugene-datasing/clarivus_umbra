# Umbra — PII Redaction for NZ Public-Sector Documents

**Detect. Review. Redact. Archive.**

Umbra is a single-tenant web application that ingests official-information
documents, identifies PII and sensitive content with a three-source
detection pipeline, lets a reviewer accept or reject each finding, and
produces a permanently redacted PDF package with an immutable audit
archive. Purpose-built for NZ councils and central-government agencies.

A DataSing product, forked from Veil and slimmed for the redaction-only
use case.

---

## The problem

Every council and agency in NZ faces the same redaction challenge:

- **Volume overload** — hundreds to thousands of documents per request.
  Manual review doesn't scale.
- **Consistency gap** — different staff apply redactions differently.
  No shared shortcut for "redact every instance of this person's name
  across the batch".
- **Defensibility risk** — once a document is released, the audit trail
  must show what was redacted, when, by whom, and survive an Ombudsman
  enquiry.
- **Privacy breach risk** — miss a redaction (a phone number on page 47,
  a witness name in a transcript) and it's a notifiable breach.

Generic redaction tools highlight and remove text. They don't understand
NZ-specific PII formats (IRD, NHI, NZ driver licence with the I/O
exclusion), don't run end-to-end on a hundred-document batch, and don't
produce the audit archive that Records Act / Privacy Act compliance
demands.

---

## What Umbra does

### Three-source detection pipeline

Three engines work in parallel; the reviewer makes every final call.

**Pattern matching** catches structured PII with deterministic accuracy —
IRD numbers, NHI identifiers, email addresses, phone numbers (NZ-specific
formats incl. parenthesised area codes), physical addresses, bank
accounts (BB-bbbb-AAAAAAA-SS), NZ passports, NZ driver licences (with
the I/O exclusion + context-word guard), vehicle registrations.

**Contextual AI** (Azure OpenAI GPT-4o) reads documents the way a
reviewer would — identifying commercially sensitive content, legal
privilege, candid / free-frank commentary, harassment risk material,
cultural sensitivity (tikanga / wāhi tapu), safety concerns, and
personal information in narrative text. Every detection includes a
confidence score and plain-language reasoning.

**Custom rules** — admin-defined keyword and regex rules for council-
or agency-specific terms (project codes, internal reference numbers,
sensitive case identifiers).

22 detection types in total. The vocabulary is fixed by
`lib/detection-type-grounds.ts` and locked by a parity test; adding a
new type is a deliberate schema change, not a hidden plumbing drift.

### Permanent redaction

Three-tier engine in `lib/pipeline/redact-pdf.ts`:

| Tier | Mode | Used for |
|---|---|---|
| 1 | Coordinate-based PyMuPDF | PDF originals with Azure DI bboxes |
| 2 | Text-search PyMuPDF | DOCX/XLSX/TXT (LibreOffice → PDF) and as a Tier-1 fallback |
| 3 | Plain-text PDF | Last resort when 1+2 both fail |

Tier 1 + 2 produce true redactions — the underlying text is removed
from the PDF, not just covered by a black rectangle. Post-export
verification confirms the redaction strings don't appear in the output's
extractable text.

### Single-package export

One ZIP per batch. Contents:

- `redacted/{originalFilename}.pdf` — one per document
- `redaction-schedule.pdf` — per-type detection summary, **never
  contains the redacted text** (Amendment A4 no-leakage rule)
- `audit-timeline.pdf` — per-document handling timeline (upload →
  processing → review → sign-off → export)
- `audit-log.pdf` + `audit-log.csv` — full immutable audit trail
- `verification-report.txt` — post-redaction verification summary
- `manifest.json` — generator + content metadata + per-document success
  flags

The export route generates the ZIP, computes a SHA-256 over the buffer,
and writes a `redaction-verification` audit entry capturing the verdict.

### Immutable audit archive

Every batch carries a per-batch SHA-256 hash chain on its audit log
(`AuditEntry.integrityHash`, `previousHash`). When a batch is purged
(admin-triggered or auto-retention), the chain is serialised to canonical
JSON-Lines + RFC-4180 CSV under `archives/{YYYY}/{batchId}/` in blob
storage, with an `integrity.json` recording chain validity + SHA-256, and
a `manifest.json` capturing the batch metadata.

The archiver roundtrip-verifies before allowing the cascade-delete to
proceed: write the JSONL, re-download it, recompute SHA-256, re-walk the
chain, and only then drop the batch row. A mismatch leaves
`purgeStatus='purging'` on the batch for human investigation.

The cross-batch download (admin only, `/api/admin/audit-archive/download`)
re-verifies every archived chain at download time and writes a top-level
`verification-summary.json` so an external auditor can independently
re-walk.

### Soft-delete + retention

Admin clicks Delete on a batch → soft-delete with a 7-day grace window.
Trash is admin-visible; Restore is one click. Purge Now is a destructive
override that requires a non-empty reason captured in the audit trail.
Auto-retention sweeps `status=exported` batches into Trash after the
configured retention window (default 14 days).

The hourly worker (pg-boss 12.x, in-process) does the cascade-delete +
blob cleanup + audit-archive write + PurgeLog insert with proper
concurrency primitives (`SELECT ... FOR UPDATE SKIP LOCKED`).

---

## Who's it for

NZ councils and central-government agencies that need to redact PII from
documents before publication or sharing — typically in response to LGOIMA
/ OIA requests, public consultations, court disclosures, or routine
records management.

Umbra **does not** own the request lifecycle (track, assign, write
correspondence). It owns the redaction step. If you need the full
LGOIMA disclosure workflow, talk to DataSing about Veil.

---

## Roles

Two roles, no exceptions:

- **Admin** — full access. Creates batches, edits org settings, manages
  users, runs Purge Now, downloads cross-batch audit archive.
- **Reviewer** — review-only on assigned batches. Accepts / rejects
  detections, signs off documents, exports.

Per-batch scoping is supported (admin can assign reviewers to specific
batches), but there's no department layer or role-graph.

---

## What's not in scope

- LGOIMA grounds vocabulary and public-interest tests (use Veil)
- Department / team / case-assignment workflow (use Veil)
- Multi-tenant SCIM provisioning
- Configurable workflow steps (Umbra is fixed at upload → review →
  export)
- Reporting beyond AI accuracy + audit timeline + cross-batch archive

---

## Architecture in one paragraph

Next.js 15 App Router + React 19 server components front-end, talking to
PostgreSQL 16 via Prisma 7. NextAuth v5 with Azure AD primary +
credentials fallback. Azure OpenAI GPT-4o for AI detection + Azure
Document Intelligence `prebuilt-read` for OCR. Azure Blob Storage in
production, local filesystem in dev. PyMuPDF (Python3 subprocess) for
true PDF redaction. pg-boss 12.x for the in-process retention worker.
Vitest unit + Playwright e2e tests. 14 Prisma models. Single
deployment artefact (Docker image to Azure Container Registry → App
Service Linux B1).
