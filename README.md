> **Umbra (in-flight rework)** — fork of Veil, simplifying to a PII redaction tool for NZ councils and central-government agencies. Full rework plan: [`docs/umbra-implementation-plan.md`](docs/umbra-implementation-plan.md). Until Phase 9 (branding + docs cleanup) lands, this document and most of the codebase retain Veil-era content; the divergence is intentional and tracked.

---

# Veil — LGOIMA Disclosure Platform (Working POC)

**AI-powered document redaction and LGOIMA disclosure workflow**
DataSing / Clarivus AI

---

## Overview

Veil is a working proof-of-concept for the NPDC RFP P26-138. It demonstrates the full LGOIMA disclosure workflow with real persistence, AI-powered detection, and PDF export:

- **PostgreSQL** database via Prisma ORM (cases, documents, detections, audit)
- **Azure AD (Entra ID)** SSO with NextAuth v5, activation flow, and SCIM provisioning
- **Azure Document Intelligence** for OCR text extraction
- **Azure OpenAI GPT-4o** for LGOIMA-aware contextual detection
- **Regex pattern detection** for structured NZ PII (IRD, phone, email, NHI, address)
- **PDF redaction engine** with permanent black-box redaction and ground references
- **Export pipeline** producing requester, internal, and ombudsman packages
- **Tiered review workflow** with document status tracking and audit trail

---

## Live Deployment

**URL:** https://veil.datasing.nz

Hosted on Azure App Service (Linux B1, custom Docker container) with PostgreSQL Flexible Server, Key Vault, and Blob Storage — all in `australiaeast` region. See `docs/azure-infrastructure-spec.md` for full details.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ (20 recommended) | Runtime |
| npm | 9+ | Package manager |
| Docker | Latest | Local PostgreSQL database |
| Python 3 | 3.x | PDF redaction (optional for dev, required for production) |

**macOS:** `brew install node@20 && brew install --cask docker`
**Linux:** See [Node.js downloads](https://nodejs.org/) + `sudo apt-get install docker.io docker-compose`
**Windows:** Use WSL2 with Ubuntu for best compatibility

---

## Quick Start (Local Development)

```bash
# 1. Start PostgreSQL (port 5434 to avoid conflicts)
docker compose up -d

# 2. Install dependencies
npm install

# 3. Create .env file with minimum required variables
#    (copy template below, then generate AUTH_SECRET with: openssl rand -base64 32)

# 4. Run database migrations
npx prisma migrate dev

# 5. (Optional) Seed with demo data — adds users, cases, documents, detections
npx prisma db seed

# 6. Run development server
npm run dev

# 7. Open in browser
open http://localhost:3000
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
# === REQUIRED ===
DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil"
AUTH_SECRET="your-32-char-secret"              # openssl rand -base64 32

# === AZURE AI (required for document processing) ===
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_KEY=<key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com
AZURE_DI_KEY=<key>

# === AZURE AD SSO (optional — falls back to credentials provider) ===
AZURE_AD_CLIENT_ID=<client-id>
AZURE_AD_CLIENT_SECRET=<client-secret>
AZURE_AD_TENANT_ID=<tenant-id>

# === OPTIONAL ===
AUTH_CREDENTIALS_ENABLED=true                  # Enable credentials login (dev mode)
SCIM_API_TOKEN=                                # SCIM user provisioning bearer token
AZURE_STORAGE_CONNECTION_STRING=                # Blob storage (falls back to local filesystem)
AZURE_COMMUNICATION_CONNECTION_STRING=         # Email notifications
APPLICATIONINSIGHTS_CONNECTION_STRING=         # Telemetry
UPLOAD_DIR=./uploads                           # Local upload directory (dev only)
EXPORT_DIR=./exports                           # Local export directory (dev only)
```

Without Azure AI keys, the app runs but document processing (OCR, AI detection) is unavailable.
In production, secrets are resolved from Key Vault via App Service managed identity. See `docs/azure-infrastructure-spec.md`.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Start production server |
| `npm run lint` | Strict ESLint (0 warnings policy) |
| `npm run test` | Run Vitest tests |
| `npx prisma studio` | Database GUI at localhost:5555 |
| `npx prisma migrate dev` | Run migrations |
| `npx prisma db seed` | Seed demo data |

---

## Seeded Demo Data

After `npx prisma db seed`, the database includes:

- **11 users** — Eugene Cash (SSO admin, eugene@datasing.nz) + 10 Palmerston North City Council staff with credentials login
- **8 departments** — City Planning, Infrastructure, Finance, Parks & Reserves, Environmental Services, Building Services, Community Services, Corporate Services
- **5 realistic LGOIMA cases** — no documents (user uploads real files during demo)
- **Pipeline milestones** and org identity settings (PNCC branding)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Can't reach database at localhost:5434` | `docker compose ps` — check container is running |
| `Cannot find module '@/lib/generated/prisma/client'` | `npx prisma generate` |
| Migration fails | `npx prisma migrate status`, then `npx prisma migrate reset` (destructive) |
| `SessionTokenError` | Check `AUTH_SECRET` is set and 32+ chars; clear browser cookies |
| Port 3000 in use | `kill -9 $(lsof -ti:3000)` or `PORT=3001 npm run dev` |
| Docker build on ARM Mac | Use `docker build --platform linux/amd64 -t veil-prototype .` |

---

## Further Documentation

| Document | Description |
|----------|-------------|
| [`DEVELOPER-NOTES.md`](DEVELOPER-NOTES.md) | Architecture decisions, what's working, remaining gaps |
| [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) | 20-minute demo walkthrough for stakeholders |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |
| [`docs/api-reference.md`](docs/api-reference.md) | REST API and server action reference |
| [`docs/requirements-traceability.md`](docs/requirements-traceability.md) | RFP requirements mapped to implementation status |
| [`docs/azure-infrastructure-spec.md`](docs/azure-infrastructure-spec.md) | Azure architecture and deployment |
| [`docs/auth-and-onboarding-spec.md`](docs/auth-and-onboarding-spec.md) | Authentication and first-run onboarding design |
| [`docs/client-deployment-activation-spec.md`](docs/client-deployment-activation-spec.md) | Client activation and licensing |
| [`docs/tier1-redaction-investigation.md`](docs/tier1-redaction-investigation.md) | Tier 1 PDF redaction dedup + bbox bug investigation |
| [`docs/lgoima-remediation-plan.md`](docs/lgoima-remediation-plan.md) | LGOIMA grounds remediation plan (taxonomy + coverage gaps) |
| [`docs/lgoima-redaction-taxonomy.md`](docs/lgoima-redaction-taxonomy.md) | Detailed LGOIMA redaction taxonomy reference |
| [`docs/lgoima-act-2026-01-15.pdf`](docs/lgoima-act-2026-01-15.pdf) | Full text of the Local Government Official Information and Meetings Act 1987 (version as at 15 January 2026) |

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Next.js 15 (App Router) | Framework — server components + client components |
| TypeScript | Type safety |
| Tailwind CSS | Styling with Clarivus brand tokens |
| Prisma ORM v7 | Database access layer (`@prisma/adapter-pg`) |
| PostgreSQL 16 | Persistence (Docker locally, Azure Flexible Server in production) |
| NextAuth v5 | Authentication (Azure AD / Entra ID + Credentials fallback) |
| Azure OpenAI (GPT-4o) | LGOIMA-aware contextual detection |
| Azure Document Intelligence | OCR and text extraction |
| Python3 + PyMuPDF | PDF redaction (permanent black-box, via subprocess) |
| pdf-lib | PDF generation (cover letters, schedules, audit trail) |
| mammoth | DOCX text extraction |
| archiver | ZIP package assembly |
| @tanstack/react-query | Client-side data caching |
| @dnd-kit/* | Drag and drop (sortable lists, reordering) |
| framer-motion | Animations and transitions |
| @azure/communication-email | Email notifications via Azure Communication Services |
| applicationinsights | Azure telemetry and error tracking |
| Lucide React | Icons |
| React Hook Form + Zod | Form validation |
| Recharts | Charts (AI governance dashboard) |
| Docker | Container deployment (multi-stage: Node.js 20 Debian slim + Python3 + LibreOffice) |

---

## Authentication and Onboarding

Veil uses NextAuth v5 with **Azure AD (Entra ID)** as the primary authentication provider and a Credentials fallback for development.

### Flow

1. **Login** — User authenticates via Azure AD SSO (or credentials in dev mode)
2. **Activation** — First user to log in enters a pre-generated activation code and is promoted to admin
3. **Setup Wizard** — Admin completes a 7-step setup wizard (organisation details, departments, roles, AI config, etc.)
4. **Invitation** — Admin invites additional users via email; invitations are domain-restricted to the organisation's email domain
5. **SCIM Provisioning** — Azure AD can push user/group changes to Veil via SCIM 2.0 endpoints (`/api/scim/Users`, `/api/scim/Groups`)

### Roles

Role names below match the enum stored in the database (`admin`, `request-manager`, `senior-reviewer`, `final-approver`, `reviewer`). UI labels are in parentheses.

| Role (enum) | UI label | Responsibility |
|-------------|----------|----------------|
| `admin` | Administrator | Full system access, organisation setup, user management |
| `request-manager` | Request Manager | Creates cases, assigns work, manages deadlines |
| `reviewer` | Reviewer | Reviews AI detections, accepts/rejects, assigns withholding grounds |
| `senior-reviewer` | Senior Reviewer | Signs off or requests changes on reviewed documents |
| `final-approver` | Final Approver | Signs off on the complete response package before release |

---

## Organisational Workflow

Veil supports a tiered LGOIMA disclosure workflow within a council or similar organisation.

### Per-Request Workflow

```
1. INTAKE           Request received -> Case created -> Deadline set (20 working days)
2. GATHER           Relevant documents identified -> Uploaded to Veil
3. PROCESS          OCR extraction -> Regex patterns -> AI detection -> Content built
                    Doc status: pending -> processing -> ready
4. INITIAL REVIEW   Reviewer opens document -> Accepts/rejects each detection
                    Assigns LGOIMA grounds (s6, s7, s17)
                    Doc status: ready -> in-review -> reviewed
5. SENIOR REVIEW    Senior reviewer checks decisions -> Sign off OR request changes
                    Doc status: reviewed -> signed-off (or back to in-review)
6. QA               Automated compliance checks -> Withholding schedule review
7. EXPORT           Redacted PDFs + withholding schedule + cover letter
                    Three packages: requester / internal / ombudsman
8. RELEASE          Sent to requester with right-of-review notice
                    Immutable audit trail preserved
```

### Document Status Flow

```
ready (for review)  ->  in-review  ->  reviewed (initial)  ->  signed-off
                          ^                    |
                          |    (request        |
                          +--- changes) -------+
```

---

## Project Structure

```
veil-prototype/
├── app/
│   ├── layout.tsx                         # Root layout (force-dynamic, providers)
│   ├── page.tsx                           # Dashboard (server component)
│   ├── login/                             # Login page (Azure AD SSO + credentials fallback)
│   ├── activate/                          # Post-login activation (enter code, become admin)
│   ├── landing-page.tsx                   # Public landing page component (rendered by page.tsx when unauthenticated)
│   ├── setup/                             # Setup wizard (7 steps)
│   ├── profile/                           # User profile page
│   ├── queue/page.tsx                     # My Queue (server component)
│   ├── reports/page.tsx                   # Reports dashboard with real analytics, templates, and cost-recovery
│   ├── requests/
│   │   ├── page.tsx                       # Cases list (server + client)
│   │   ├── new/page.tsx                   # New LGOIMA request form
│   │   └── [id]/
│   │       ├── page.tsx                   # Case detail (server + client)
│   │       ├── case-detail-client.tsx     # Case detail interactive UI
│   │       ├── ingest/                    # Document upload + processing
│   │       ├── review/[docId]/            # Document review (split-panel)
│   │       ├── schedule/                  # Withholding schedule
│   │       ├── audit/                     # Audit trail (WORM)
│   │       ├── export/                    # Export / release
│   │       ├── qa/                        # Pre-release QA (with simulation mode)
│   │       └── bulk-review/               # Bulk redaction review
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts    # NextAuth API routes
│   │   ├── activation-status/             # Activation status check
│   │   ├── documents/
│   │   │   ├── upload/route.ts            # File upload endpoint
│   │   │   └── [docId]/
│   │   │       ├── process/route.ts       # Trigger processing pipeline
│   │   │       └── status/route.ts        # Poll processing status
│   │   ├── detections/[detectionId]/      # Detection review actions
│   │   ├── export/[requestId]/            # Export generation + download
│   │   ├── schedule/[requestId]/route.ts  # Withholding schedule PDF
│   │   ├── files/[...path]/route.ts       # Serve uploaded files
│   │   ├── health/                        # Health check endpoint
│   │   ├── notifications/                 # Notifications API
│   │   ├── reports/                       # Cost recovery reports
│   │   ├── logo/                          # Organisation logo upload/serve/delete
│   │   ├── scim/                          # SCIM 2.0 provisioning
│   │   │   ├── Users/                     # SCIM user management
│   │   │   └── Groups/                    # SCIM group management
│   │   └── telemetry/                     # Error telemetry endpoint
│   └── admin/
│       ├── rules/page.tsx                 # Custom rules manager
│       ├── settings/page.tsx              # Settings & admin
│       └── ai-governance/page.tsx         # AI governance dashboard
├── components/
│   ├── layout/
│   │   ├── app-shell.tsx                  # App shell with sidebar
│   │   └── sidebar.tsx                    # Navigation sidebar
│   ├── review/
│   │   ├── ai-learning-panel.tsx          # AI learning from reviewer feedback
│   │   ├── manual-detection-popover.tsx   # Manual detection creation
│   │   └── statutory-ground-selector.tsx  # LGOIMA ground picker
│   ├── accessibility/
│   │   └── keyboard-shortcuts-help.tsx    # Keyboard shortcut reference
│   ├── common/
│   │   └── error-display.tsx              # Shared error display
│   ├── providers/
│   │   ├── session-provider.tsx           # NextAuth session provider
│   │   └── query-provider.tsx             # React Query provider
│   └── sw-register.tsx                    # Service worker registration
├── lib/
│   ├── utils.ts                           # Shared utilities
│   ├── lgoima-grounds.ts                  # LGOIMA s6/s7/s17 ground definitions
│   ├── logger.ts                          # Structured logging
│   ├── rate-limit.ts                      # API rate limiting
│   ├── api-utils.ts                       # API response helpers
│   ├── telemetry.ts                       # Application Insights integration
│   ├── auth/
│   │   ├── auth-options.ts                # NextAuth config (Azure AD + Credentials)
│   │   ├── auth.config.ts                 # Edge-compatible auth config (middleware)
│   │   ├── session.ts                     # requireUser(), requireAdmin() helpers
│   │   └── authorize.ts                   # authorizeForCase() role checks
│   ├── db/
│   │   ├── prisma.ts                      # Prisma client singleton
│   │   └── mappers.ts                     # Status/type configs and display types
│   ├── data/
│   │   ├── cases.ts                       # Case queries
│   │   ├── documents.ts                   # Document queries
│   │   ├── detections.ts                  # Detection queries
│   │   ├── audit.ts                       # Audit log queries + writes
│   │   ├── activation.ts                  # Activation code lookups
│   │   ├── ai-metrics.ts                  # AI accuracy metrics
│   │   ├── audit-sanitize.ts              # Audit data sanitisation
│   │   ├── backup-restore.ts              # Database backup/restore
│   │   ├── cost-recovery.ts               # Cost recovery data
│   │   ├── departments.ts                 # Department queries
│   │   ├── detection-history.ts           # Detection change history
│   │   ├── document-content.ts            # Document content (paragraphs/segments)
│   │   ├── org-config.ts                  # Organisation configuration
│   │   ├── pipeline.ts                    # Pipeline state queries
│   │   ├── processing-metrics.ts          # Processing time metrics
│   │   ├── qa-simulation.ts               # QA simulation data
│   │   ├── reports.ts                     # Report queries
│   │   ├── rules.ts                       # Custom rule queries
│   │   ├── settings.ts                    # System setting queries
│   │   ├── snapshots.ts                   # Detection snapshot queries
│   │   └── snapshot-diff.ts               # Snapshot comparison
│   ├── actions/
│   │   ├── activation-actions.ts          # Activation code validation
│   │   ├── case-actions.ts                # Create case server action
│   │   ├── department-actions.ts          # Department CRUD actions
│   │   ├── detection-actions.ts           # Accept/reject/sign-off server actions
│   │   ├── invitation-actions.ts          # User invitation actions
│   │   ├── manual-detection-actions.ts    # Manual detection creation
│   │   ├── pipeline-actions.ts            # Pipeline trigger actions
│   │   ├── profile-actions.ts             # User profile updates
│   │   ├── rule-actions.ts                # Custom rule CRUD
│   │   ├── settings-actions.ts            # System settings updates
│   │   └── setup-actions.ts               # Setup wizard completion
│   ├── config/
│   │   ├── env.ts                         # Environment variable definitions
│   │   └── validate-env.ts                # Startup environment validation
│   ├── validation/
│   │   └── schemas.ts                     # Zod validation schemas
│   ├── rules/
│   │   └── rule-tester.ts                 # Custom rule test runner
│   ├── email/
│   │   ├── email-client.ts               # Azure Communication Services client
│   │   ├── send.ts                        # Email sending functions
│   │   └── templates.ts                   # Email templates (invitations, notifications)
│   ├── integrations/
│   │   ├── m365-connector.ts              # Microsoft 365 integration (SharePoint, OneDrive, Outlook)
│   │   ├── records-connector.ts           # Records management system integration
│   │   └── ediscovery-connector.ts        # eDiscovery platform integration
│   ├── resilience/
│   │   ├── circuit-breaker.ts             # Circuit breaker for external services
│   │   ├── retry.ts                       # Retry with exponential backoff
│   │   └── azure-services.ts             # Azure service health monitoring
│   ├── queue/
│   │   └── job-queue.ts                   # Persistent job queue with retry
│   ├── storage/
│   │   ├── types.ts                       # Storage provider interface
│   │   ├── local.ts                       # Local filesystem storage
│   │   ├── azure-blob.ts                  # Azure Blob Storage provider
│   │   └── index.ts                       # Storage factory
│   └── pipeline/
│       ├── process.ts                     # Main pipeline orchestrator
│       ├── extract.ts                     # Text extraction (Azure DI, mammoth)
│       ├── patterns.ts                    # Regex NZ PII detection
│       ├── ai-detect.ts                   # Azure OpenAI GPT-4o detection
│       ├── content-builder.ts             # Build DocParagraph[] for review UI
│       ├── file-validator.ts              # Corrupted/unreadable file detection
│       ├── format-converter.ts            # Document format conversion
│       ├── email-extract.ts               # Email extraction (EML, MSG)
│       ├── custom-rules.ts                # Custom rule matching
│       ├── duplicate-detect.ts            # Exact + near-duplicate detection
│       ├── sanitise-metadata.ts           # Metadata sanitisation
│       ├── merge.ts                       # Deduplicate pattern + AI detections
│       ├── bbox.ts                        # Bounding box utilities
│       ├── chain-of-custody.ts            # Chain-of-custody tracking
│       ├── version-snapshot.ts            # Version snapshot creation
│       ├── feedback-examples.ts           # AI feedback example management
│       ├── rebuild-content.ts             # Content rebuild after edits
│       ├── cost-recovery-report.ts        # Cost recovery report generation
│       ├── multimedia-extract.ts          # Multimedia content extraction
│       ├── redact_pdf_pymupdf.py          # PyMuPDF PDF redaction (Python)
│       ├── verify_redaction_pymupdf.py    # PyMuPDF redaction verification (Python)
│       ├── verify-redaction.ts            # Redaction verification orchestrator
│       ├── redact-pdf.ts                  # PDF redaction orchestrator (calls Python)
│       ├── schedule.ts                    # Withholding schedule PDF generator
│       ├── cover-letter.ts                # Cover letter PDF generator
│       ├── logo-helper.ts                 # Shared PDF logo embedding helper
│       ├── audit-pdf.ts                   # Audit trail PDF generator
│       └── export.ts                      # ZIP export package assembler
├── prisma/
│   ├── schema.prisma                      # Database schema (19 models, 18 migrations)
│   └── seed.ts                            # Demo data seed script
├── scripts/
│   ├── generate-activation-code.ts        # Generate activation code for new deployments
│   ├── reset-instance.ts                  # Reset instance state for fresh demo
│   ├── seed-content.ts                    # Seed content into existing documents
│   └── check-content.ts                   # Diagnostic: check document content structure
├── tests/
│   └── benchmarks/                        # Performance benchmarks
├── .github/workflows/
│   ├── ci.yml                             # CI: lint, type check, tests, build
│   ├── docker.yml                         # Docker image build + push to ACR
│   └── migrate.yml                        # Database migration runner
├── docs/
│   ├── azure-infrastructure-spec.md       # Azure architecture & deployment
│   ├── auth-and-onboarding-spec.md        # Auth & first-run onboarding design
│   └── client-deployment-activation-spec.md  # Client deployment & activation flow
├── Dockerfile                             # Multi-stage: Node 20 Debian slim + Python3 + LibreOffice
├── .dockerignore                          # Excludes node_modules, .next, .env*, etc.
├── docker-compose.yml                     # Local PostgreSQL 16 (port 5434)
├── next.config.ts                         # standalone output mode
├── middleware.ts                          # Auth middleware (route protection)
├── instrumentation.ts                     # Application Insights initialisation
├── vitest.config.ts                       # Vitest test configuration
├── DEMO-SCRIPT.md                         # 20-minute demo walkthrough
├── DEVELOPER-NOTES.md                     # Architecture decisions and gaps
└── README.md                              # This file
```

---

## Database Schema (Prisma)

19 models across 18 migrations:

| Model | Purpose |
|-------|---------|
| User | Authenticated users with roles and org membership |
| Department | Organisation departments |
| UserInvitation | Pending email invitations (domain-restricted) |
| ActivationCode | One-time codes for first-user admin activation |
| Case | LGOIMA request cases with deadlines and status |
| Document | Uploaded documents linked to cases |
| DocumentPage | Extracted pages with OCR text |
| Detection | AI/pattern detections with grounds and confidence |
| DetectionHistory | Change history for each detection |
| DetectionSnapshot | Point-in-time snapshots for version comparison |
| FeedbackExample | Reviewer feedback used for AI learning |
| AuditEntry | Immutable audit trail (WORM) |
| FileUpload | File metadata and storage references |
| CustomRule | User-defined detection rules |
| SystemSetting | Organisation-level configuration |
| CaseMilestone | Milestone tracking per case |
| CaseAssignment | User-to-case role assignments |
| ExportJob | Export package generation with progress tracking |
| ProcessingJob | Persistent job queue entries with retry state |

---

## Key Screens

### Fully Working (with real data)
- **Landing Page** (`/`, unauthenticated) — Public-facing product page with feature showcase, screenshots, stats, and demo request form
- **Dashboard** (`/`, authenticated) — Active cases, queue summary, recent activity
- **Cases List** (`/requests`) — All LGOIMA requests with search and filters
- **New Request** (`/requests/new`) — Intake form with auto-deadline and DB persistence
- **Case Detail** (`/requests/[id]`) — Document table with real status tracking
- **Document Ingestion** (`/requests/[id]/ingest`) — Drag-and-drop upload with real processing
- **Document Review** (`/requests/[id]/review/[docId]`) — Split-panel review with AI detections, accept/reject with grounds, submit/sign-off workflow
- **Withholding Schedule** (`/requests/[id]/schedule`) — Auto-generated from accepted detections, PDF preview
- **Audit Trail** (`/requests/[id]/audit`) — Immutable log of all actions
- **Export** (`/requests/[id]/export`) — Real PDF redaction, ZIP packages (requester/internal/ombudsman)
- **Bulk Review** (`/requests/[id]/bulk-review`) — Bulk redaction across document sets
- **Custom Rules** (`/admin/rules`) — Custom detection rule editor with test runner
- **Settings** (`/admin/settings`) — Multi-tab admin configuration (org, AI, integrations, email)
- **AI Governance** (`/admin/ai-governance`) — Model accuracy metrics and governance dashboard
- **Setup Wizard** (`/setup`) — 7-step initial configuration wizard
- **Activation** (`/activate`) — Post-login activation code entry
- **Profile** (`/profile`) — User profile management
- **Queue** (`/queue`) — Personal work queue with job monitoring

### UI Present, Limited Functionality
- **QA Screen** (`/requests/[id]/qa`) — Pre-release quality checks with simulation mode


---

## Processing Pipeline

When documents are uploaded, Veil processes them through:

1. **File validation** — Detect corrupted or unreadable files before processing
2. **Format conversion** — Convert documents to a consistent processing format
3. **Email extraction** — Extract content from email formats (EML, MSG), with attachments spawned as child documents
4. **Text extraction** — Azure Document Intelligence `prebuilt-read` for PDFs (with word-level polygons), mammoth for DOCX
5. **Document classification** — GPT-4o classifies document type and content flags (legal advice, personnel info, commercial, cultural, enforcement) — context injected into subsequent detection batches
6. **Regex pattern detection** — NZ IRD numbers, phone numbers, email addresses, NHI numbers, street addresses, bank accounts, vehicle registrations (95% confidence, deterministic)
7. **AI contextual detection** — Azure OpenAI GPT-4o analyses text in 3-page batches with document-level context, identifying 27+ detection types with LGOIMA ground suggestions
8. **Custom rule matching** — Apply user-defined detection rules
9. **BBox calculation** — Word-level polygon matching to compute percentage-based per-line bounding boxes for PDF originals; detection text longer than 80 characters short-circuits to zero bbox and falls through to Tier 2 text-search.
10. **Cross-source deduplication** — Pattern, AI, and custom rule detections unified and deduplicated by `(page, type, text, round(posY * 10) / 10)` so repeated occurrences of the same text at different vertical positions survive as separate Detection rows.
11. **Duplicate detection** — Exact and near-duplicate document identification across the case
12. **Metadata sanitisation** — Strip hidden metadata and embedded content
13. **Content building** — Extracted text + detections combined into structured DocParagraph[] model (with heading, list, and table support for DOCX)
14. **Storage** — Pages, detections, and content JSON stored in PostgreSQL

### AI Detection Prompt

The GPT-4o system prompt is LGOIMA-aware:
- Classifies detections by type (personal-name, phone, email-addr, ird, address, commercial, legal-privilege, etc.)
- Suggests appropriate withholding grounds (s7(2)(a), s7(2)(b)(ii), s7(2)(f)(i), etc.)
- Considers public interest context (public officials have lower privacy expectations)
- Distinguishes between actual PII and labels/headings that describe PII categories
- Provides reviewer-facing reasoning and explanation

---

## Export Packages

Three export types are supported:

| Package | Contents |
|---------|----------|
| **Requester** | Redacted PDFs + withholding schedule + cover letter |
| **Internal** | Redacted PDFs + withholding schedule + cover letter + audit trail |
| **Ombudsman** | All of the above + original unredacted documents |

Redacted PDFs have:
- Permanent black rectangles over accepted detections
- LGOIMA ground reference labels in white text on the redaction bars
- Metadata stripped (author, title, keywords)

---

## Design System

Clarivus brand tokens in `tailwind.config.ts`:

- **Primary:** `#3e13af` (Clarivus purple)
- **Accent:** `#1A9F6F` (Clarivus green)
- **Fonts:** Playfair Display (headings), DM Sans (body), JetBrains Mono (mono)
  - Fonts are self-hosted via `next/font/google` (build-time bundled, no runtime Google Fonts dependency)
- **Confidence colours:** Green (high >= 85%), Amber (medium 50-84%), Red (low < 50%)

Component classes in `app/globals.css`: `.btn-primary`, `.btn-secondary`, `.card`, `.badge`, `.input-field`.

Responsive design with mobile-friendly layout and bottom navigation bar on small screens.

---

## Build

```bash
# Local development
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Strict ESLint (0 warnings policy)
npm run test     # Run Vitest tests (319 tests)

# Docker (local — use --platform on ARM Macs)
docker build --platform linux/amd64 -t veil-prototype .
docker run -p 3000:3000 --env-file .env veil-prototype

# Azure deployment (via ACR Tasks — no local Docker needed)
az acr build --registry acrveilprototype --image veil-prototype:latest --file Dockerfile .
az webapp restart --name app-veil-prototype --resource-group rg-veil-prototype
```

### CI/CD

GitHub Actions runs on every push and pull request (`.github/workflows/ci.yml`):
- ESLint (strict, 0 warnings)
- TypeScript type checking
- Vitest test suite (319 tests)
- Production build

Additional workflows handle Docker image builds (`docker.yml`) and database migrations (`migrate.yml`).

---

## Notes

- This is a working POC — real database, real AI, real PDF redaction
- **Authentication** is implemented via NextAuth v5 with Azure AD (Entra ID) as the primary provider and Credentials as a development fallback
- **Activation flow** — the first user to log in enters a pre-generated activation code (see `scripts/generate-activation-code.ts`) and is promoted to admin, then completes the 7-step setup wizard to configure the organisation
- **SCIM provisioning** — Azure AD can automatically sync users and groups to Veil via SCIM 2.0 endpoints, supporting automated onboarding/offboarding
- **User invitations** — admins invite users via email; invitations are domain-restricted to the organisation's configured email domain
- Role-based access control: admin, senior-reviewer, request-manager, final-approver, reviewer
- The document review screen uses a PDF viewer with detection overlays for PDFs and styled HTML for non-PDF documents
- LGOIMA grounds are accurately sourced from the Act
- **Responsive design** — mobile-friendly with bottom navigation bar on small viewports
- **CI/CD pipeline** — GitHub Actions enforces lint, type check, tests, and build on every push and PR
- **Azure deployment** is live — see `docs/azure-infrastructure-spec.md` for full architecture
- See `DEVELOPER-NOTES.md` for architecture decisions and remaining gaps
- **CSRF protection** — state-changing API routes require `X-Requested-With: XMLHttpRequest` header
- **Structured logging** — all server-side code uses `lib/logger.ts` for structured JSON logging in production
- **Database-backed rate limiting** — activation endpoint uses PostgreSQL-backed rate limiting instead of in-memory
- **LibreOffice conversion** — non-PDF documents (DOCX, XLSX, TXT) are converted to PDF at export time for true redaction via LibreOffice headless
- **Fonts** — self-hosted via `next/font/google` — no runtime dependency on Google Fonts CDN
