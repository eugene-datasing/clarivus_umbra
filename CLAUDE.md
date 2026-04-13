# Veil Prototype — Claude Code Context

## What This Is

Veil is a working POC for an AI-powered LGOIMA (Local Government Official Information and Meetings Act 1987) disclosure workflow platform. Built for the NPDC RFP P26-138 by DataSing (Wellington, NZ). Part of the Clarivus AI product suite.

This is NOT just a redaction tool — it's a full disclosure workflow: intake, AI detection, tiered review, permanent redaction, export packages, and audit trail.

## Quick Reference

| Item | Value |
|------|-------|
| Framework | Next.js 15 (App Router) + TypeScript + React 19 |
| Database | PostgreSQL 16 via Prisma ORM v7 (`@prisma/adapter-pg`) |
| Auth | NextAuth v5 — Azure AD (Entra ID) primary, Credentials fallback |
| AI | Azure OpenAI GPT-4o (detection), Azure Document Intelligence (OCR) |
| Storage | Azure Blob Storage (prod), local filesystem (dev) |
| PDF generation | pdf-lib (cover letters, schedules, audit reports) |
| PDF redaction | PyMuPDF via Python3 subprocess |
| Dev DB port | 5434 (not 5432) |
| Dev DB creds | `postgresql://veil:veil_dev@localhost:5434/veil` |
| Models | 19 Prisma models, 17 migrations |
| Tests | 216 Vitest unit tests + 297 Playwright e2e tests |

## Local Development

```bash
# Start PostgreSQL (Docker required)
docker compose up -d

# Install deps + run migrations
npm install && npx prisma migrate dev

# (Optional) Seed demo data: 10 users, 18 cases, 24 docs, 35 detections
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
Upload -> File validation -> Format conversion -> OCR (Azure DI) -> Regex patterns (NZ PII) -> AI detection (GPT-4o) -> Custom rules -> Deduplication -> Content building -> Storage

### Review Workflow
```
processing -> ready -> in-review -> reviewed -> signed-off
                        ^              |
                        +-- (request --+
                            changes)
```

### Export Packages
Three variants: **requester** (redacted + schedule + cover letter), **internal** (+ audit trail), **ombudsman** (+ originals)

### PDF Generation
- `lib/pipeline/cover-letter.ts` — LGOIMA response cover letter
- `lib/pipeline/schedule.ts` — Withholding schedule grouped by ground
- `lib/pipeline/chain-of-custody.ts` — Chain-of-custody report
- `lib/pipeline/logo-helper.ts` — Shared helper for embedding org logo in PDFs
- `lib/pipeline/audit-pdf.ts` — Audit trail report

### Storage
`StorageProvider` interface in `lib/storage/types.ts` with implementations:
- `lib/storage/local.ts` — local filesystem (dev)
- `lib/storage/azure-blob.ts` — Azure Blob Storage (prod)
- `lib/storage/index.ts` — factory (checks `AZURE_STORAGE_CONNECTION_STRING`)

### Roles
`admin`, `request-manager`, `senior-reviewer`, `final-approver`, `reviewer`

All authorization functions (`requireUser()`, `requireAdmin()`, `authorizeForCase()`) re-read the user's role from the database rather than trusting the JWT claim, since the JWT can be stale after role changes.

## LGOIMA Grounds

Defined in `lib/lgoima-grounds.ts`:
- **Section 6** — Conclusive reasons (must withhold): s6(a)–s6(d)
- **Section 7** — Other reasons (public interest test): s7(2)(a)–s7(2)(j)
- **Section 17** — Refusal grounds: s17(c)–s17(f)

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
| `e2e/` | Playwright end-to-end tests |
| `docs/` | Architecture and deployment documentation |

## Testing

```bash
npm run test              # 216 Vitest unit tests
npm run test:e2e          # 297 Playwright e2e tests (seeds test users first)
npm run test:e2e:ui       # Playwright with UI
npm run lint              # ESLint (0 warnings policy)
```

## Common Gotchas

- **Prisma AI safety check**: Destructive commands like `migrate reset` require `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead"` env var
- **`--skip-seed` removed in Prisma 7**: Use `PRISMA_SKIP_SEED=true` env var instead
- **Standalone tsx scripts**: Must pass `DATABASE_URL` explicitly — `npx tsx -e` doesn't load `.env`
- **Docker on macOS**: Docker CLI may not be on PATH if Docker Desktop uses App Translocation
- **Port conflicts**: Use `PORT=3001 npm run dev` if 3000 is taken
- **Buffer in NextResponse**: Use `new Uint8Array(data)` not `Buffer` for API route response bodies
