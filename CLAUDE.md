# Veil Prototype — Claude Code Context

## What This Is

Veil is a working POC for an AI-powered LGOIMA (Local Government Official Information and Meetings Act 1987) disclosure workflow platform. Originally built for the NPDC RFP P26-138 by DataSing (Wellington, NZ). Part of the Clarivus AI product suite. The current demo instance targets **Palmerston North City Council (PNCC)**.

This is NOT just a redaction tool — it's a full disclosure workflow: intake, AI detection, tiered review, permanent redaction, export packages, and audit trail.

## Quick Reference

| Item | Value |
|------|-------|
| Framework | Next.js 15 (App Router) + TypeScript + React 19 |
| Database | PostgreSQL 16 via Prisma ORM v7 (`@prisma/adapter-pg`) |
| Auth | NextAuth v5 — Azure AD (Entra ID) primary, Credentials fallback |
| AI | Azure OpenAI GPT-4o (detection + document classification), Azure Document Intelligence `prebuilt-read` (OCR) |
| Storage | Azure Blob Storage (prod), local filesystem (dev) |
| PDF generation | pdf-lib (cover letters, schedules, audit reports) |
| PDF redaction | PyMuPDF via Python3 subprocess (3-tier: coordinate, text-search, plain-text) |
| Dev DB port | 5434 (not 5432) |
| Dev DB creds | `postgresql://veil:veil_dev@localhost:5434/veil` |
| Models | 19 Prisma models, 17+ migrations |
| Tests | 216 Vitest unit tests + 297 Playwright e2e tests |
| Live URL | https://veil.datasing.nz |
| Azure region | `australiaeast` (App Service B1 + PostgreSQL Flexible Server + ACR + Key Vault + Blob Storage) |

## Local Development

```bash
# Start PostgreSQL (Docker required)
docker compose up -d

# Install deps + run migrations
npm install && npx prisma migrate dev

# (Optional) Seed demo data: 11 PNCC users, 5 realistic LGOIMA cases (no documents — user uploads real files)
npx prisma db seed

# Start dev server
npm run dev

# If port 3000 is occupied:
PORT=3001 npm run dev
```

### Database Commands

```bash
npx prisma migrate dev          # Run migrations
npx prisma db seed              # Seed demo data
npx prisma studio               # GUI at localhost:5555
npx prisma migrate reset        # Reset DB (requires PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead")

# Reset WITHOUT seed data:
PRISMA_SKIP_SEED=true npx prisma migrate reset --force

# Run standalone scripts against the DB (must pass DATABASE_URL explicitly):
DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx tsx -e '<script>'
```

### Docker on macOS

Docker CLI may not be on PATH. If `docker` is not found:
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

## Key Environment Variables

Required in `.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — NextAuth secret (openssl rand -base64 32)

For AI processing:
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY`

For SSO:
- `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`

For storage:
- `AZURE_STORAGE_CONNECTION_STRING` (falls back to local filesystem if not set)

## Architecture

### Server / Client Split
- Pages use async server components that query PostgreSQL via Prisma, passing data as props to `"use client"` children.
- Mutations go through server actions in `lib/actions/`.

### Auth Flow
1. Login via Azure AD SSO (or credentials in dev)
2. First user enters activation code at `/activate` and becomes admin
3. Admin completes 7-step setup wizard at `/setup`
4. Admin invites users via email (domain-restricted)
5. SCIM provisioning available at `/api/scim/Users` and `/api/scim/Groups`

### Document Processing Pipeline
Upload -> File validation -> Format conversion -> OCR (Azure DI `prebuilt-read`) -> Document classification (GPT-4o) -> Regex patterns (NZ PII) -> AI detection (GPT-4o, 3-page batches with doc-level context) -> Custom rules -> Cross-source dedup by `(page, type, text)` -> BBox calculation -> Content building -> Storage

**27 detection types** across 4 categories: personal (person-name, phone, email-addr, ird, address, nhi, bank-account, vehicle-reg), commercial (commercial, council-commercial), legal/governance (legal-privilege, negotiation, free-frank-opinion, conduct-obligations), safety/enforcement (safety-concern, law-enforcement, harassment-risk, cultural-sensitivity, health-safety), and more.

### Review Workflow
```
processing -> ready -> in-review -> reviewed -> signed-off
                        ^              |
                        +-- (request --+
                            changes)
```

### Export Packages
Three variants: **requester** (redacted + schedule + cover letter), **internal** (+ audit trail), **ombudsman** (+ originals)

### PDF Redaction Engine (three tiers)

| Tier | Mode | Used for | File |
|------|------|----------|------|
| 1 | Coordinate-based | PDF originals with Azure DI bounding boxes | `redact_pdf_pymupdf.py` (coordinate mode) |
| 2 | Text-search | DOCX/XLSX/TXT via LibreOffice convert + PyMuPDF `search_for` | `redact_pdf_pymupdf.py` (text-search mode) |
| 3 | Plain-text PDF | Last resort when Tier 1+2 both fail | `redact-pdf.ts` (generateTextPdf) |

Orchestrated by `lib/pipeline/redact-pdf.ts`. For PDFs, Tier 1 runs first; on exception falls through to Tier 2 (text-search on the original PDF, no LibreOffice needed). For non-PDFs, LibreOffice headless converts to PDF then Tier 2 searches all pages for each unique detection text.

### PDF Generation
- `lib/pipeline/cover-letter.ts` — LGOIMA response cover letter
- `lib/pipeline/schedule.ts` — Withholding schedule grouped by ground
- `lib/pipeline/chain-of-custody.ts` — Chain-of-custody report
- `lib/pipeline/logo-helper.ts` — Shared helper for embedding org logo in PDFs (Noto Sans for macron support)
- `lib/pipeline/audit-pdf.ts` — Audit trail report
- `lib/pipeline/cost-recovery-report.ts` — Cost recovery report

### Storage
`StorageProvider` interface in `lib/storage/types.ts` with implementations:
- `lib/storage/local.ts` — local filesystem (dev)
- `lib/storage/azure-blob.ts` — Azure Blob Storage (prod)
- `lib/storage/index.ts` — factory (checks `AZURE_STORAGE_CONNECTION_STRING`)

### Roles
`admin`, `request-manager`, `senior-reviewer`, `final-approver`, `reviewer`

All authorization functions (`requireUser()`, `requireAdmin()`, `authorizeForCase()`) re-read the user's role from the database rather than trusting the JWT claim, since the JWT can be stale after role changes.

## LGOIMA Grounds

Defined in `lib/lgoima-grounds.ts` — **27 grounds** validated by Zod schema:
- **Section 6** — Conclusive reasons (must withhold): s6(a)–s6(d)
- **Section 7** — Other reasons (public interest test): s7(2)(a)–s7(2)(j), including sub-sections like s7(2)(b)(i), s7(2)(b)(ii), s7(2)(c)(i), s7(2)(c)(ii), s7(2)(f)(i), s7(2)(f)(ii)
- **Section 17** — Refusal grounds: s17(c)–s17(f)

Grounds are grouped by detection pathway in the AI prompt (privacy-pathway, commercial-pathway, governance-pathway, enforcement-pathway) with worked examples.

## Key Directories

| Path | Purpose |
|------|---------|
| `app/` | Next.js App Router pages and API routes |
| `app/api/` | REST endpoints (upload, process, export, SCIM, logo, etc.) |
| `components/` | Shared React components |
| `lib/actions/` | Server actions (mutations) |
| `lib/data/` | Database query functions |
| `lib/pipeline/` | Document processing, detection, redaction, PDF generation |
| `lib/auth/` | Auth config, session helpers, authorization |
| `lib/storage/` | Storage provider abstraction |
| `lib/config/` | Environment variable definitions |
| `prisma/` | Schema and migrations |
| `scripts/` | Standalone utility scripts (activation code gen, instance reset, content seed) |
| `e2e/` | Playwright end-to-end tests |
| `docs/` | Architecture and deployment documentation |

## Testing

```bash
npm run test              # 216 Vitest unit tests
npm run test:e2e          # 297 Playwright e2e tests (seeds test users first)
npm run test:e2e:ui       # Playwright with UI
npm run lint              # ESLint (0 warnings policy)
```

## Azure Deployment

Live at **https://veil.datasing.nz** — Azure App Service (Linux B1, custom Docker container).

```bash
# Build and push Docker image to ACR
az acr build --registry acrveilprototype --image veil-prototype:cr<N> --file Dockerfile .

# Deploy new image
az webapp config container set --name app-veil-prototype --resource-group rg-veil-prototype \
  --container-image-name acrveilprototype.azurecr.io/veil-prototype:cr<N>
az webapp restart --name app-veil-prototype --resource-group rg-veil-prototype

# Run migrations against Azure DB
DATABASE_URL="postgresql://veiladmin:<password>@psql-veil-prototype.postgres.database.azure.com:5432/veil?sslmode=require" \
  npx prisma migrate deploy

# Run seed against Azure DB (must specify DATABASE_URL — prisma.config.ts reads from env)
DATABASE_URL="postgresql://veiladmin:<password>@psql-veil-prototype.postgres.database.azure.com:5432/veil?sslmode=require" \
  npx tsx prisma/seed.ts

# Reset Azure DB (destructive)
DATABASE_URL="<azure-url>" PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead" \
  npx prisma migrate reset --force
```

**Env validation:** `lib/config/env.ts` skips validation when `NEXT_PHASE` is `phase-production-build` (build-time doesn't have runtime secrets).

## Seed Data (PNCC Demo)

After `npx prisma db seed`, the database includes:
- **11 users** — Eugene Cash (SSO admin, eugene@datasing.nz) + 10 PNCC staff with credentials login
- **8 departments** — City Planning, Infrastructure, Finance, Parks & Reserves, Environmental Services, Building Services, Community Services, Corporate Services
- **5 realistic LGOIMA cases** — no documents (user uploads real files during demo)
- Pipeline milestones and org identity settings (Palmerston North City Council branding)

## Known Bugs — Tier 1 PDF Redaction

See `docs/tier1-redaction-investigation.md` for full investigation report.

### Bug 1: Dedup collapses repeated text occurrences (priority 1)
**File:** `lib/pipeline/process.ts:577-592`
Dedup key is `(page, type, text)` — coordinates are NOT in the key. If "Rohan Patel" appears 3 times on page 1 at different Y positions, only ONE Detection row survives. `calculateBBox` (called after dedup) returns the first occurrence's bbox. Occurrences 2 and 3 are unredacted.

### Bug 2: Oversized bounding boxes (priority 2)
**File:** `lib/pipeline/bbox.ts:66-97`
`computeBoxFromWords` returns the axis-aligned UNION of all matched word polygons. When detection text spans multiple lines, the bbox covers from line-1-top to line-N-bottom (observed: 84% width × 18% height). AI detections with long narrative text produce section-sized black rectangles.

### Bug 3: No Tier 1 text-length filter
Tier 2 has `TEXT_SEARCH_MAX_LENGTH = 80` (`redact-pdf.ts:249`) to reject AI-generated contextual summaries. Tier 1 has no equivalent — long AI texts flow through `calculateBBox` and produce oversized rectangles.

### Workaround
DOCX files use Tier 2 (text-search) which correctly finds and redacts all occurrences via PyMuPDF `page.search_for()` on every page. Only PDF originals are affected.

## Common Gotchas

- **Prisma AI safety check**: Destructive commands like `migrate reset` require `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead"` env var
- **`--skip-seed` removed in Prisma 7**: Use `PRISMA_SKIP_SEED=true` env var instead
- **Standalone tsx scripts**: Must pass `DATABASE_URL` explicitly — `npx tsx -e` doesn't load `.env`. For complex queries, write a `.ts` file and run `DATABASE_URL="..." npx tsx script.ts`
- **Shell escaping in DB password**: Azure DB password contains `!` — use single-quoted strings or write commands to a script file: `bash script.sh`
- **Prisma client output path**: Generated to `lib/generated/prisma/client` not `@prisma/client`. Import as `@/lib/generated/prisma/client` (app code) or `../lib/generated/prisma/client` (standalone scripts). Run `npx prisma generate` if module not found.
- **Table names in raw SQL**: Prisma uses `@@map` for snake_case: `detections` not `Detection`, `audit_entries` not `AuditEntry`. Column names are camelCase and need quoting: `"posY"`, `"caseId"`, `"integrityHash"`.
- **timestamp without time zone**: Audit hash is computed with `new Date().toISOString()` (UTC). On read, pg driver re-interprets stored timestamp in local TZ. Use `to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` in raw SQL to read exact stored value.
- **Docker on macOS**: Docker CLI may not be on PATH if Docker Desktop uses App Translocation
- **Port conflicts**: Use `PORT=3001 npm run dev` if 3000 is taken
- **Buffer in NextResponse**: Use `new Uint8Array(data)` not `Buffer` for API route response bodies
