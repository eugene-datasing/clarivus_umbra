# Umbra

PII redaction for NZ public-sector documents.

Umbra is a single-tenant web application that ingests documents (PDF, DOCX,
XLSX, EML, MSG, TXT), runs a three-source detection pipeline (regex patterns,
AI via Azure OpenAI, custom rules) over the extracted text, lets a reviewer
accept or reject each finding, and produces a permanently redacted PDF
package with an audit-traceable archive.

It is the simpler successor to **Veil** — a fuller LGOIMA disclosure
workflow built for NZ councils. Umbra drops the disclosure workflow and
keeps the redaction core. The fork lives at
[`DataSing/clarivus_umbra`](https://github.com/eugene-datasing/clarivus_umbra)
on GitHub; the Veil predecessor sits at `DataSing/clarivus_veil` and is
historical context only.

## Audience

NZ councils and central-government agencies that need to redact PII from
documents before publishing or sharing them — typically in response to
LGOIMA / OIA requests, public consultations, court disclosures, or routine
records management. Umbra does not own the request lifecycle (assign, track,
correspond) — only the redaction step.

## Locked v1 scope

- Two roles: `admin` and `reviewer`. No departments, no SCIM.
- A **batch** is the unit of work. One or more documents → reviewer
  accepts/rejects detections → admin signs off → exported as a single ZIP.
- 22-entry detection-type vocabulary (NZ-flavoured PII + governance
  categories). Type-driven; no LGOIMA grounds anywhere in the data model.
- Soft-delete with a 7-day grace window, then hard-delete plus an immutable
  audit-archive blob.
- Single export package: redacted PDFs + redaction schedule + audit
  timeline + audit log (CSV + PDF) + manifest.

## What's in the box

| | |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript + React 19 |
| Database | PostgreSQL 16 via Prisma ORM 7.5 (`@prisma/adapter-pg`) |
| Auth | NextAuth v5 — Azure AD (Entra ID) primary, Credentials fallback |
| AI | Azure OpenAI GPT-4o (detection + classification), Azure Document Intelligence `prebuilt-read` (OCR) |
| Storage | Azure Blob Storage (prod), local filesystem (dev) |
| Background jobs | pg-boss 12.x — runs in-process inside the Next.js server |
| PDF generation | pdf-lib (schedule, audit-timeline, audit-log) |
| PDF redaction | PyMuPDF via Python3 subprocess (3-tier: coordinate → text-search → plain-text) |
| Tests | Vitest unit + Playwright e2e |
| Models | 14 Prisma models, 1 migration (`0001_init`) |
| Live URL | (Phase 11 will publish) |
| Azure region | NZ North primary (Australia East fallback for AI services) |

## Local development

```bash
# Start PostgreSQL (Docker required)
docker compose up -d

# Install deps + run migrations
npm install
npx prisma migrate dev

# Seed demo data — Ministry of Demo + 1 admin + 3 reviewers + 3 sample Batches
npx prisma db seed

# Start dev server
npm run dev

# If port 3000 is occupied:
PORT=3001 npm run dev
```

### Database

| | |
|---|---|
| Dev port | `5434` (not 5432) |
| Dev creds | `postgresql://umbra:umbra_dev@localhost:5434/umbra` |
| Prisma client output | `lib/generated/prisma` — import as `@/lib/generated/prisma/client` |
| Reset | `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead" npx prisma migrate reset --force` |
| Reset without seed | add `PRISMA_SKIP_SEED=true` |
| Studio | `npx prisma studio` (localhost:5555) |

`prisma.config.ts` reads `DATABASE_URL` from the environment. Standalone
scripts (`npx tsx ...`) need it passed in explicitly — they don't load
`.env`.

### Docker on macOS

If `docker` is not on PATH:
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

## Required env vars

Required in `.env` for the dev server:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — NextAuth secret (`openssl rand -base64 32`)

Required for AI processing:
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY`

For SSO:
- `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`

For prod blob storage:
- `AZURE_STORAGE_CONNECTION_STRING` (falls back to local filesystem if unset)

Full list with descriptions in `.env.example`.

## Architecture

### Server / client split
Pages are async server components that query PostgreSQL via Prisma and pass
data as props to `"use client"` children. Mutations go through server
actions in `lib/actions/`.

### Auth flow
1. Login via Azure AD SSO (or credentials in dev).
2. First user enters activation code at `/activate` and becomes `admin`.
3. Admin completes the 5-step setup wizard at `/setup` (Org Identity →
   Document Branding → Detection Policies → Team Setup → Review).
4. Admin invites users via email. Two roles only: `admin`, `reviewer`.

### Document processing pipeline
Upload → file validation → format conversion → OCR (Azure DI `prebuilt-read`)
→ document classification (GPT-4o) → regex patterns (NZ PII) → AI detection
(GPT-4o, 3-page batches with doc-level context) → custom rules → bbox
calculation (per-line, >80-char text short-circuits) → cross-source dedup
by `(page, type, text, posY_rounded)` → content building → storage.

### Detection types (22 in `lib/detection-type-grounds.ts`)
- **Personal**: `personal-name`, `phone`, `email-addr`, `ird`, `address`,
  `bank-account`, `nz-passport`, `nz-driver-licence`, `vehicle-reg`, `nhi`
- **Commercial**: `commercial`, `council-commercial`, `negotiation`
- **Governance**: `legal-privilege`, `confidential`, `free-frank`,
  `harassment-risk`, `cultural-sensitivity`
- **Enforcement**: `safety-concern`, `law-enforcement`, `health-safety`
- `manual` — reviewer-added, no auto-classification

### Batch lifecycle
```
draft → processing → ready-for-review → reviewed → exported
                                                   │
                                          (admin) ┴→ deleted (soft)
                                                   │
                                          (worker) ┴→ purged (hard + archived)
```

### Export package
Single ZIP per batch, contents:
```
redacted/{originalFilename}.pdf      one per accepted document
redaction-schedule.pdf                per-type detection summary, no leakage
audit-timeline.pdf                    per-document handling timeline
audit-log.pdf                         full immutable audit trail
audit-log.csv                         RFC-4180 CSV mirror of the trail
verification-report.txt               post-redaction verification summary
manifest.json                         generator + content metadata
```

### PDF redaction engine (3 tiers)

| Tier | Mode | For | Implementation |
|---|---|---|---|
| 1 | Coordinate-based | PDF originals with Azure DI bboxes | `redact_pdf_pymupdf.py` (coordinate mode) |
| 2 | Text-search | DOCX/XLSX/TXT via LibreOffice convert + PyMuPDF `search_for` | `redact_pdf_pymupdf.py` (text-search mode) |
| 3 | Plain-text PDF | Last resort when Tier 1+2 both fail | `redact-pdf.ts` (`generateTextPdf`) |

Orchestrated by `lib/pipeline/redact-pdf.ts`. Tier 1 first; on exception
falls through to Tier 2 (text-search on the original PDF). For non-PDFs,
LibreOffice headless converts to PDF then Tier 2 searches all pages.

### Retention worker (Phase 6)

pg-boss 12.x runs an in-process worker that:
- Hourly **retention sweep**: claims any batch whose `purgeScheduledAt`
  has elapsed (`SELECT ... FOR UPDATE SKIP LOCKED`), archives the audit
  chain to blob storage with roundtrip verification, cascade-deletes the
  batch, cleans up the data blobs, writes a `PurgeLog` row.
- Hourly **auto-retention pass**: soft-deletes any `status=exported`
  batch that's been idle longer than `RETENTION_CONFIG.retentionDaysAfterCompletion`
  (default 14 days). Standard grace window applies.
- Per-request **purge-batch** job: admin-triggered Purge Now path.

See `lib/jobs/runner.ts` and `lib/jobs/audit-archive.ts`.

### Storage abstraction
`StorageProvider` interface in `lib/storage/types.ts` with implementations:
- `lib/storage/local.ts` — local filesystem (dev)
- `lib/storage/azure-blob.ts` — Azure Blob Storage (prod)
- `lib/storage/index.ts` — factory (checks `AZURE_STORAGE_CONNECTION_STRING`)

Six operations: `upload, download, getUrl, delete, exists, listByPrefix`.

## Testing

```bash
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright e2e (seeds test users first)
npm run test:e2e:ui       # Playwright with UI
npm run lint              # ESLint, 0-warning policy
```

## Bench / detection-quality

```bash
npm run bench:detection   # Run the detection bench against the canonical fixtures
npm run bench:suite       # Multi-fixture suite
npm run bench:compare     # Compare to a frozen baseline
npm run bench:canonical   # Capture a new canonical baseline
```

Baselines live under `docs/bench-baselines/`.

## Key directories

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router pages and API routes |
| `app/api/` | REST endpoints (upload, process, export, logo, audit-archive download, etc.) |
| `components/` | Shared React components |
| `lib/actions/` | Server actions (mutations) |
| `lib/data/` | Database query functions |
| `lib/pipeline/` | Document processing, detection, redaction, PDF generation |
| `lib/jobs/` | pg-boss worker + audit-archive helpers |
| `lib/auth/` | Auth config, session helpers, authorisation |
| `lib/storage/` | Storage provider abstraction |
| `lib/config/` | Environment variable definitions |
| `prisma/` | Schema + migrations + seed |
| `scripts/` | Standalone utility scripts |
| `e2e/` | Playwright end-to-end tests |
| `docs/` | Architecture and process documentation |
| `docs/legacy-veil/` | Archived Veil-era documents kept for reference |

## Background and traceability

Umbra forks from Veil's `feat/parallel-ai-batches` branch at the
`v0.0.0-umbra-fork` tag. The full rework plan, current-state survey, and
phase-by-phase log are in:

- [`docs/umbra-implementation-plan.md`](docs/umbra-implementation-plan.md)
- [`docs/umbra-current-state-survey.md`](docs/umbra-current-state-survey.md)

Phase deliverables (1 → 11) are tagged in the commit history; each phase's
landing point is referenced in CHANGELOG.md.

For Veil-era specifications (LGOIMA workflow, ground vocabulary, original
Azure deployment guides) see `docs/legacy-veil/`.

## Licence

Proprietary. Property of DataSing.
