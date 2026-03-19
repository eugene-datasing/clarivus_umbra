# Veil — LGOIMA Disclosure Platform (Working POC)

**AI-powered document redaction and LGOIMA disclosure workflow**
DataSing / Clarivus AI

---

## Overview

Veil is a working proof-of-concept for the NPDC RFP P26-138. It demonstrates the full LGOIMA disclosure workflow with real persistence, AI-powered detection, and PDF export:

- **PostgreSQL** database via Prisma ORM (cases, documents, detections, audit)
- **Azure Document Intelligence** for OCR text extraction
- **Azure OpenAI GPT-4o** for LGOIMA-aware contextual detection
- **Regex pattern detection** for structured NZ PII (IRD, phone, email, NHI, address)
- **PDF redaction engine** with permanent black-box redaction and ground references
- **Export pipeline** producing requester, internal, and ombudsman packages
- **Tiered review workflow** with document status tracking and audit trail

---

## Quick Start

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Run database migrations
DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx prisma migrate dev

# 4. Seed with demo data
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
DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil"
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_KEY=<key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com
AZURE_DI_KEY=<key>
```

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Next.js 15 (App Router) | Framework — server components + client components |
| TypeScript | Type safety |
| Tailwind CSS | Styling with Clarivus brand tokens |
| Prisma ORM | Database access layer |
| PostgreSQL 16 | Persistence (Docker) |
| Azure OpenAI (GPT-4o) | LGOIMA-aware contextual detection |
| Azure Document Intelligence | OCR and text extraction |
| pdf-lib | PDF generation, redaction, and metadata stripping |
| mammoth | DOCX text extraction |
| archiver | ZIP package assembly |
| Lucide React | Icons |
| React Hook Form + Zod | Form validation |
| Recharts | Charts (AI governance dashboard) |

---

## Organisational Workflow

Veil supports a tiered LGOIMA disclosure workflow within a council or similar organisation.

### Roles

| Role | Responsibility |
|------|---------------|
| **LGOIMA Coordinator** | Creates cases, assigns work, manages deadlines |
| **Initial Reviewer** | Reviews AI detections, accepts/rejects, assigns withholding grounds |
| **Senior Reviewer** | Signs off or requests changes on reviewed documents |
| **Final Approver** | Signs off on the complete response package before release |

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
│   ├── layout.tsx                         # Root layout with sidebar
│   ├── page.tsx                           # Dashboard (server component)
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
│   │       ├── qa/                        # Pre-release QA
│   │       └── bulk-review/               # Bulk redaction review
│   ├── api/
│   │   ├── documents/
│   │   │   ├── upload/route.ts            # File upload endpoint
│   │   │   └── [docId]/
│   │   │       ├── process/route.ts       # Trigger processing pipeline
│   │   │       └── status/route.ts        # Poll processing status
│   │   ├── export/[requestId]/            # Export generation + download
│   │   ├── schedule/[requestId]/route.ts  # Withholding schedule PDF
│   │   └── files/[...path]/route.ts       # Serve uploaded files
│   └── admin/
│       ├── rules/page.tsx                 # Custom rules manager
│       ├── settings/page.tsx              # Settings & admin
│       └── ai-governance/page.tsx         # AI governance dashboard
├── components/
│   ├── layout/sidebar.tsx                 # Navigation sidebar
│   └── providers/query-provider.tsx       # React Query provider
├── lib/
│   ├── utils.ts                           # Shared utilities
│   ├── lgoima-grounds.ts                  # LGOIMA s6/s7/s17 ground definitions
│   ├── db/
│   │   ├── prisma.ts                      # Prisma client singleton
│   │   └── mappers.ts                     # Status/type configs and display types
│   ├── data/
│   │   ├── cases.ts                       # Case queries
│   │   ├── documents.ts                   # Document queries
│   │   ├── detections.ts                  # Detection queries
│   │   ├── audit.ts                       # Audit log queries + writes
│   │   └── document-content.ts            # Document content (paragraphs/segments)
│   ├── actions/
│   │   ├── case-actions.ts                # Create case server action
│   │   └── detection-actions.ts           # Accept/reject/sign-off server actions
│   ├── storage/
│   │   ├── types.ts                       # Storage provider interface
│   │   ├── local.ts                       # Local filesystem storage
│   │   └── index.ts                       # Storage factory
│   └── pipeline/
│       ├── process.ts                     # Main pipeline orchestrator
│       ├── extract.ts                     # Text extraction (Azure DI, mammoth)
│       ├── patterns.ts                    # Regex NZ PII detection
│       ├── ai-detect.ts                   # Azure OpenAI GPT-4o detection
│       ├── merge.ts                       # Deduplicate pattern + AI detections
│       ├── content-builder.ts             # Build DocParagraph[] for review UI
│       ├── redact-pdf.ts                  # PDF redaction engine
│       ├── schedule.ts                    # Withholding schedule PDF generator
│       ├── cover-letter.ts                # Cover letter PDF generator
│       ├── audit-trail-pdf.ts             # Audit trail PDF generator
│       └── export.ts                      # ZIP export package assembler
├── prisma/
│   ├── schema.prisma                      # Database schema
│   └── seed.ts                            # Demo data seed script
├── docker-compose.yml                     # PostgreSQL 16
├── DEMO-SCRIPT.md                         # 20-minute demo walkthrough
├── DEVELOPER-NOTES.md                     # Architecture decisions and gaps
└── README.md                              # This file
```

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

### UI Present, Limited Functionality
- **Bulk Review** (`/requests/[id]/bulk-review`) — Bulk redaction interface
- **QA Screen** (`/requests/[id]/qa`) — Pre-release quality checks
- **Custom Rules** (`/admin/rules`) — Rule list with editor
- **Settings** (`/admin/settings`) — Multi-tab admin configuration
- **AI Governance** (`/admin/ai-governance`) — Model accuracy metrics

### Stub/Placeholder
- **Reports** (`/reports`) — Placeholder with coming-soon notice

---

## Processing Pipeline

When documents are uploaded, Veil processes them through:

1. **Text extraction** — Azure Document Intelligence for PDFs, mammoth for DOCX
2. **Regex pattern detection** — NZ IRD numbers, phone numbers, email addresses, NHI numbers, street addresses (95% confidence, deterministic)
3. **AI contextual detection** — Azure OpenAI GPT-4o analyses text with LGOIMA-specific system prompt, identifies personal names, commercial content, legal privilege, and other sensitive information
4. **Deduplication** — Pattern and AI detections are merged, removing overlaps
5. **Content building** — Extracted text + detections are combined into a structured paragraph/segment model for the review UI
6. **Storage** — Pages, detections, and content JSON stored in PostgreSQL

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

---

## Build

```bash
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint check
```

---

## Notes

- This is a working POC — real database, real AI, real PDF redaction
- No authentication (single implicit user) — schema supports multi-user
- The document review screen uses a simulated document view (styled HTML) rather than PDF.js
- LGOIMA grounds are accurately sourced from the Act
- See `DEVELOPER-NOTES.md` for architecture decisions and remaining gaps
