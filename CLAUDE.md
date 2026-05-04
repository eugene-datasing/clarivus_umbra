# Umbra — Claude Code Context

## What this is

Umbra is a **mass-PII-redaction tool** for NZ public-sector documents.
It forked from **Veil** (a fuller LGOIMA disclosure platform) at the
`v0.0.0-umbra-fork` tag and went through two major reworks: the
initial Veil → Umbra strip-down, and **Phase 12 (Umbra v2)** which
re-focused on mass redaction (drop the LGOIMA-grounds vocabulary,
auto-redact-by-default, cluster-by-similar review Tray). The full
rework programme is documented in
[`docs/umbra-implementation-plan.md`](docs/umbra-implementation-plan.md).

The audience is councils and central-government agencies. Umbra owns
the redaction step only — not request lifecycle. A **batch** is the
unit of work: one or more uploaded documents → tier-routed detection
write (high-confidence auto-accepted, medium → Tray, low → suppressed)
→ reviewer triages the Tray clusters → batch reaches `auto-redacted`
or `reviewed` → auto-export ZIP.

## Quick reference

| Item | Value |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript + React 19 |
| Database | PostgreSQL 16 via Prisma ORM 7.5 (`@prisma/adapter-pg`) |
| Auth | NextAuth v5 — Azure AD (Entra ID) primary, Credentials fallback |
| AI | Azure OpenAI GPT-4o (detection + classification), Azure Document Intelligence `prebuilt-read` (OCR) |
| Storage | Azure Blob Storage (prod), local filesystem (dev) |
| Background jobs | pg-boss 12.x (in-process inside Next.js server) |
| PDF generation | pdf-lib (schedule, audit-timeline, audit-log) |
| PDF redaction | PyMuPDF via Python3 subprocess (3-tier) |
| Dev DB port | `5434` (not 5432) |
| Dev DB creds | `postgresql://umbra:umbra_dev@localhost:5434/umbra` |
| Roles | `admin`, `reviewer` (no SCIM, no departments) |
| Detection types | 12 (`lib/detection-type-grounds.ts`) — Phase 12.1 collapsed the v1 22-type LGOIMA vocabulary to PII-only |
| Models | 14 Prisma models, 1 migration (`0001_init`) |
| Live URL | https://app-umbra-prototype.azurewebsites.net |
| Azure region | Australia East (Phase 11b) |
| Auto-redact | High-confidence detections auto-accepted at write time; medium → Tray; low → suppressed (Phase 12.2) |

## Local development

```bash
docker compose up -d
npm install && npx prisma migrate dev
npx prisma db seed     # Ministry of Demo + admin + 3 reviewers + 3 batches
npm run dev
PORT=3001 npm run dev  # if 3000 is taken
```

### Database commands

```bash
npx prisma migrate dev          # Run migrations
npx prisma db seed              # Seed demo data
npx prisma studio               # GUI at localhost:5555
npx prisma migrate reset        # Reset DB (requires consent flag below)
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead" npx prisma migrate reset --force
PRISMA_SKIP_SEED=true npx prisma migrate reset --force   # Reset without seed

# Standalone scripts MUST pass DATABASE_URL — `npx tsx -e` doesn't load .env
DATABASE_URL="postgresql://umbra:umbra_dev@localhost:5434/umbra" npx tsx -e '<script>'
```

### Docker on macOS

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

### Schema changes — additive migrations only

Phase 12.6a onwards: schema changes get **their own additive migration**
on top of `0001_init`. **Do not amend `prisma/migrations/<timestamp>_init/migration.sql`**.

```bash
# Edit prisma/schema.prisma (add column / index / model — no destructive renames)
DATABASE_URL="postgresql://umbra:umbra_dev@localhost:5434/umbra" \
  npx prisma migrate dev --name <descriptive-name>
```

Why: through Phase 12 we kept editing the init and resetting prod (and
local) DBs on every deploy. With v2 live, prod data must survive
deploys; `prisma migrate deploy` only forward-applies new files. If you
need a destructive change (rename column, drop NOT NULL, change type),
write the migration by hand or use `--create-only` and edit the SQL
before applying.

The prod `DATABASE_URL` in Key Vault carries Prisma pool tuning
(`?sslmode=require&connection_limit=15&pool_timeout=20`). Both params
are documented Prisma data-source options and `migrate deploy` accepts
them today. If a future Prisma release ever errors on connection-string
parsing, strip the pool params for the migrate step and retry with
`?sslmode=require` only — the runtime URL keeps the tuning for the
App Service container.

## Key environment variables

Required in `.env`:
- `DATABASE_URL`, `AUTH_SECRET`

For AI processing:
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY`

For SSO:
- `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`

For storage:
- `AZURE_STORAGE_CONNECTION_STRING` (falls back to local filesystem if unset)

Full list with descriptions in `.env.example`.

## Architecture

### Server / client split

Pages use async server components that query PostgreSQL via Prisma, passing
data as props to `"use client"` children. Mutations go through server
actions in `lib/actions/`.

### Auth flow

1. Login via Azure AD SSO (or credentials in dev)
2. First user enters activation code at `/activate` and becomes admin
3. Admin completes 5-step setup wizard at `/setup`
4. Admin invites users via email (domain-restricted)

### Document processing pipeline

Upload → file validation → format conversion → OCR (Azure DI `prebuilt-read`)
→ regex patterns (NZ PII) → label-adjacent (table fields) → AI detection
(GPT-4o, 3-page batches; PII-only prompt per Phase 12.1) → custom rules
→ entity-propagation (personal-name only) → bbox calculation (per-line;
>80-char text short-circuits) → cross-source dedup by
`(page, type, text, posY_rounded)` → **tier-routing** (Phase 12.2:
`bucketConfidence` → `accepted` / `pending` / `rejected` at write time)
→ pageContext capture (Phase 12.4: ±100 chars around match) → content
building → storage.

**Detection types** — 12 in `lib/detection-type-grounds.ts`. Personal:
`personal-name`, `phone`, `email-addr`, `address`, `ird`,
`nz-driver-licence`, `nhi`, `nz-passport`, `bank-account`, `vehicle-reg`.
Plus `sensitive-context` (Phase 12.1 catch-all for personal-circumstance
content: medical / employment / financial-hardship / family-violence
prose, internal employee identifiers, salary values) and `manual`
(reviewer-added).

### Review workflow

```
processing → ready ─────────────┐
              └→ auto-redacted ─┤
                                ├→ exported (after auto-export or manual export)
              ┌→ in-review → reviewed → signed-off ─┘
```

The batch surfaces these states aggregated across its documents (per
`recomputeBatchStatus` in `lib/data/batches.ts`).

**Auto-redact path** (Phase 12.2): when every detection lands at
`accepted` (no pending in the Tray), the document goes straight to
`auto-redacted`; the batch follows when all docs are auto-redacted; an
auto-export pg-boss job fires (gated by `AUTO_REDACT_CONFIG.autoExportEnabled`).

**Review path**: documents with at least one `pending` detection go to
`ready`; reviewers triage via the Tray (`/batches/[id]/bulk-review`)
which clusters by `(type, normalisedText)` and surfaces ±100-char
pageContext snippets for disambiguation. Per-doc review at
`/batches/[id]/review/[docId]` is the drill-in target for individual
overrides.

### Export package

Single ZIP per batch. Contents:

```
redacted/{originalFilename}.pdf      one per accepted document
redaction-schedule.pdf                grouped by detection type, no leakage
audit-timeline.pdf                    per-document handling timeline
audit-log.pdf                         full immutable audit trail
audit-log.csv                         RFC-4180 CSV mirror
verification-report.txt               post-redaction verification summary
manifest.json                         generator + content metadata
```

Built by `lib/pipeline/export.ts`. Roundtrip-verified before the batch
cascade-deletes (Phase 6c retention worker).

### PDF redaction engine (3 tiers)

| Tier | Mode | Used for | Implementation |
|---|---|---|---|
| 1 | Coordinate-based | PDF originals with Azure DI bboxes | `redact_pdf_pymupdf.py` (coordinate mode) |
| 2 | Text-search | DOCX/XLSX/TXT via LibreOffice convert + PyMuPDF `search_for` | `redact_pdf_pymupdf.py` (text-search mode) |
| 3 | Plain-text PDF | Last resort when Tier 1+2 both fail | `redact-pdf.ts` (`generateTextPdf`) |

Orchestrated by `lib/pipeline/redact-pdf.ts`.

### Retention / purge

Phase 6 wired the soft-delete + audit-archive pipeline. Admin can soft-
delete a batch from the batches list; the worker (pg-boss, in-process)
archives the audit chain to blob storage and cascade-deletes after the
grace window. Auto-retention sweeps `status=exported` batches into the
trash after `RETENTION_CONFIG.retentionDaysAfterCompletion` days.

`lib/jobs/audit-archive.ts` carries the canonical-JSONL serialiser and
the chain-verification helper. Roundtrip verification gates the
cascade-delete.

### PDF generation helpers

- `lib/pipeline/redaction-schedule.ts` — schedule grouped by detection type (no leakage)
- `lib/pipeline/audit-timeline.ts` — per-document handling timeline
- `lib/pipeline/audit-pdf.ts` — full audit trail PDF
- `lib/pipeline/logo-helper.ts` — embed org logo (Noto Sans for macron support)

### Storage

`StorageProvider` interface in `lib/storage/types.ts` with implementations:
- `lib/storage/local.ts` — local filesystem (dev)
- `lib/storage/azure-blob.ts` — Azure Blob Storage (prod)
- `lib/storage/index.ts` — factory (checks `AZURE_STORAGE_CONNECTION_STRING`)

### Roles

`admin`, `reviewer`. Two-role world per Phase 3.

All authorisation functions (`requireUser()`, `requireAdmin()`,
`authorizeForBatch()`) re-read the user's role from the database rather
than trusting the JWT claim — JWTs can go stale after role changes.

## Key directories

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router pages and API routes |
| `app/api/` | REST endpoints (upload, process, export, logo, etc.) |
| `components/` | Shared React components |
| `lib/actions/` | Server actions (mutations) |
| `lib/data/` | Database query functions |
| `lib/pipeline/` | Document processing, detection, redaction, PDF generation |
| `lib/jobs/` | pg-boss worker + audit-archive helpers |
| `lib/auth/` | Auth config, session helpers, authorisation |
| `lib/storage/` | Storage provider abstraction |
| `lib/config/` | Environment variable definitions |
| `prisma/` | Schema and migrations |
| `scripts/` | Standalone utility scripts |
| `e2e/` | Playwright end-to-end tests |
| `docs/` | Active architecture + process docs |
| `docs/legacy-veil/` | Archived Veil-era specs (LGOIMA, NPDC, etc.) |

## Testing

```bash
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright e2e (seeds test users first)
npm run test:e2e:ui       # Playwright with UI
npm run lint              # ESLint (0 warnings policy)
```

## Azure deployment

Phase 11 will publish the canonical `umbra.<domain>.nz`. Until then the
deploy procedure documented here is informational only.

```bash
# Build and push Docker image to ACR
az acr build --registry acrumbraprototype --image umbra-prototype:cr<N> --file Dockerfile .

# Deploy
az webapp config container set --name app-umbra-prototype --resource-group rg-umbra-prototype \
  --container-image-name acrumbraprototype.azurecr.io/umbra-prototype:cr<N>
az webapp restart --name app-umbra-prototype --resource-group rg-umbra-prototype

# Run migrations against Azure DB
DATABASE_URL="postgresql://umbraadmin:<password>@psql-umbra-prototype.postgres.database.azure.com:5432/umbra?sslmode=require" \
  npx prisma migrate deploy

# Reset Azure DB (destructive)
DATABASE_URL="<azure-url>" PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead" \
  npx prisma migrate reset --force
```

**Env validation:** `lib/config/env.ts` skips validation when `NEXT_PHASE`
is `phase-production-build` (build-time doesn't have runtime secrets).

## Seed data (Ministry of Demo)

After `npx prisma db seed`, the database includes:

- **1 admin user** — Eugene Cash (`eugene@datasing.nz`, SSO admin)
- **3 reviewer users** — fictional NZ-flavoured names with credentials login
- **Organisation** — "Ministry of Demo" (a fictional central-government agency)
- **3 sample Batches** with auto-generated `BATCH-2026-NNN` references — no
  documents (admin uploads real files during demos)
- Setup-wizard state and org identity / branding settings

## PDF redaction Tier 1 — resolved

The three Tier 1 bugs flagged in
`docs/tier1-redaction-investigation.md` were resolved in April 2026 (Veil
era; behaviour preserved post-fork):

- **Per-occurrence redaction** — `calculateBBoxAll` in `lib/pipeline/bbox.ts`
  returns one bbox per visual line per match; `processDocument` enriches
  detections with coordinates before dedup and keys dedup on
  `(page, type, text, posY_rounded)` so repeats survive.
- **Multi-line bboxes** — `computeBoxesFromWords` splits matched words by
  `yTolerance` into visual lines and emits one tight rectangle per line.
- **Text-length guard** — `lib/pipeline/bbox.ts` rejects detection text
  longer than 80 chars (matches `TEXT_SEARCH_MAX_LENGTH` in
  `redact-pdf.ts`), so AI long-narrative summaries fall through to
  Tier 2 text-search.

If regressions reappear, the canonical functions are `calculateBBoxAll` /
`computeBoxesFromWords` in `lib/pipeline/bbox.ts` and the dedup block in
`processDocument`'s detection-merge step.

## Common gotchas

- **Prisma AI safety check**: destructive commands like `migrate reset`
  require `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead"`.
- **`--skip-seed` removed in Prisma 7**: use `PRISMA_SKIP_SEED=true` env
  var instead.
- **Standalone tsx scripts** must pass `DATABASE_URL` explicitly — `npx
  tsx -e` doesn't load `.env`. For complex queries, write a `.ts` file
  and run with `DATABASE_URL="..." npx tsx script.ts`.
- **Shell escaping in DB password**: Azure DB password contains `!` —
  use single-quoted strings or run the command from a script file.
- **Prisma client output path**: generated to `lib/generated/prisma/client`
  not `@prisma/client`. Import as `@/lib/generated/prisma/client` (app
  code) or `../lib/generated/prisma/client` (standalone scripts). Run
  `npx prisma generate` if module not found.
- **Table names in raw SQL**: Prisma uses `@@map` for snake_case —
  `detections` not `Detection`, `audit_entries` not `AuditEntry`. Column
  names are camelCase and need quoting: `"posY"`, `"batchId"`,
  `"integrityHash"`.
- **`timestamp without time zone`**: audit hash is computed with
  `new Date().toISOString()` (UTC). On read, the `pg` driver
  re-interprets stored timestamp in local TZ. Use `to_char(timestamp,
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` in raw SQL to read the exact stored
  value. See `lib/data/audit.ts:verifyAuditIntegrity` and
  `lib/jobs/audit-archive.ts:loadCanonicalEntries` for the canonical
  pattern.
- **Buffer in NextResponse**: use `new Uint8Array(data)` not `Buffer` for
  API route response bodies.
