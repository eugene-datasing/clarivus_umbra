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

## Quick Start (Local Development)

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Run database migrations
DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx prisma migrate dev

# 4. (Optional) Seed with demo data
DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx prisma db seed

# 5. Configure Azure credentials in .env
#    See .env.example for required variables

# 6. Run development server
npm run dev

# 7. Open in browser
open http://localhost:3000
```

Requires Node.js 18+, npm 9+, Docker.

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil"

# Azure AI
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_KEY=<key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com
AZURE_DI_KEY=<key>

# Azure AD SSO
AZURE_AD_CLIENT_ID=<client-id>
AZURE_AD_CLIENT_SECRET=<client-secret>
AZURE_AD_TENANT_ID=<tenant-id>

# Azure Communication Services (email)
AZURE_COMMUNICATION_CONNECTION_STRING=<connection-string>

# Azure Blob Storage
AZURE_BLOB_CONNECTION_STRING=<connection-string>

# Azure Application Insights (telemetry)
APPLICATIONINSIGHTS_CONNECTION_STRING=<connection-string>

# Auth
AUTH_SECRET=<random-32-char-string>
AUTH_CREDENTIALS_ENABLED=true
```

In Azure, secrets are resolved from Key Vault via App Service managed identity references. See `docs/azure-infrastructure-spec.md` section 6 for the full production configuration.

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
| Docker | Container deployment (multi-stage: Node.js 20 Alpine + Python3) |

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

| Role | Responsibility |
|------|---------------|
| **Admin** | Full system access, organisation setup, user management |
| **LGOIMA Coordinator** | Creates cases, assigns work, manages deadlines |
| **Initial Reviewer** | Reviews AI detections, accepts/rejects, assigns withholding grounds |
| **Senior Reviewer** | Signs off or requests changes on reviewed documents |
| **Final Approver** | Signs off on the complete response package before release |

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
│   ├── setup/                             # Setup wizard (7 steps)
│   ├── profile/                           # User profile page
│   ├── queue/page.tsx                     # My Queue (server component)
│   ├── reports/page.tsx                   # Reports (stub)
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
│       ├── audit-pdf.ts                   # Audit trail PDF generator
│       └── export.ts                      # ZIP export package assembler
├── prisma/
│   ├── schema.prisma                      # Database schema (17 migrations)
│   └── seed.ts                            # Demo data seed script
├── scripts/
│   └── generate-activation-code.ts        # Generate activation code for new deployments
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
├── Dockerfile                             # Multi-stage: Node 20 Alpine + Python3
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

18 models across 17 migrations:

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
| ProcessingJob | Persistent job queue entries with retry state |

---

## Key Screens

### Fully Working (with real data)
- **Dashboard** (`/`) — Active cases, queue summary, recent activity
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

### Stub/Placeholder
- **Reports** (`/reports`) — Placeholder with coming-soon notice

---

## Processing Pipeline

When documents are uploaded, Veil processes them through:

1. **File validation** — Detect corrupted or unreadable files before processing
2. **Format conversion** — Convert documents to a consistent processing format
3. **Email extraction** — Extract content from email formats (EML, MSG)
4. **Text extraction** — Azure Document Intelligence for PDFs, mammoth for DOCX
5. **Regex pattern detection** — NZ IRD numbers, phone numbers, email addresses, NHI numbers, street addresses (95% confidence, deterministic)
6. **AI contextual detection** — Azure OpenAI GPT-4o analyses text with LGOIMA-specific system prompt, identifies personal names, commercial content, legal privilege, and other sensitive information
7. **Custom rule matching** — Apply user-defined detection rules
8. **Deduplication** — Pattern and AI detections are merged, removing overlaps
9. **Duplicate detection** — Exact and near-duplicate document identification across the case
10. **Metadata sanitisation** — Strip hidden metadata and embedded content
11. **Content building** — Extracted text + detections are combined into a structured paragraph/segment model for the review UI
12. **Storage** — Pages, detections, and content JSON stored in PostgreSQL

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
npm run test     # Run Vitest tests (216 tests)

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
- Vitest test suite (216 tests)
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
- The document review screen uses a simulated document view (styled HTML) rather than PDF.js
- LGOIMA grounds are accurately sourced from the Act
- **Responsive design** — mobile-friendly with bottom navigation bar on small viewports
- **CI/CD pipeline** — GitHub Actions enforces lint, type check, tests, and build on every push and PR
- **Azure deployment** is live — see `docs/azure-infrastructure-spec.md` for full architecture
- See `DEVELOPER-NOTES.md` for architecture decisions and remaining gaps
