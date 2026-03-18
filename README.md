# Veil — LGOIMA Disclosure Platform Prototype

**AI-powered document redaction and LGOIMA disclosure workflow**
DataSing / Clarivus AI

---

## Overview

This is a working UI prototype of Veil, built for the NPDC RFP P26-138 demo. It demonstrates the full LGOIMA disclosure workflow: case management, document ingestion, AI-powered detection review, withholding schedule generation, audit trails, and export.

This prototype uses mock data — no backend services or AI models are connected. All data is static and realistic, contextualised to NPDC operations.

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open in browser
open http://localhost:3000
```

Requires Node.js 18+ and npm 9+.

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Next.js 15 (App Router) | Framework |
| TypeScript | Type safety |
| Tailwind CSS | Styling with Clarivus brand tokens |
| Lucide React | Icons |
| React Hook Form + Zod | Form validation (wired for new request form) |
| Recharts | Charts (AI governance dashboard) |

---

## Project Structure

```
veil-prototype/
├── app/
│   ├── layout.tsx                         # Root layout with sidebar
│   ├── page.tsx                           # Dashboard
│   ├── queue/page.tsx                     # My Queue
│   ├── reports/page.tsx                   # Reports (stub)
│   ├── requests/
│   │   ├── page.tsx                       # Cases list
│   │   ├── new/page.tsx                   # New LGOIMA request form
│   │   └── [id]/
│   │       ├── page.tsx                   # Case detail / document set overview
│   │       ├── ingest/page.tsx            # Document ingestion
│   │       ├── review/[docId]/page.tsx    # Document review (centrepiece)
│   │       ├── schedule/page.tsx          # Withholding schedule
│   │       ├── audit/page.tsx             # Audit trail (WORM)
│   │       ├── export/page.tsx            # Export / release
│   │       ├── qa/page.tsx                # Pre-release QA
│   │       └── bulk-review/page.tsx       # Bulk redaction review
│   └── admin/
│       ├── rules/page.tsx                 # Custom rules manager
│       ├── settings/page.tsx              # Settings & admin
│       └── ai-governance/page.tsx         # AI governance dashboard
├── components/
│   ├── layout/sidebar.tsx                 # Navigation sidebar
│   └── review/statutory-ground-selector.tsx  # LGOIMA ground picker modal
├── lib/
│   ├── utils.ts                           # Shared utilities
│   ├── lgoima-grounds.ts                  # LGOIMA s6/s7/s17 ground definitions
│   └── mock-data/
│       ├── requests.ts                    # 5 mock LGOIMA requests
│       ├── documents.ts                   # 15 mock documents
│       ├── detections.ts                  # 12 mock AI detections
│       └── audit-log.ts                   # 17 mock audit entries
├── DEMO-SCRIPT.md                         # 20-minute demo walkthrough
├── DEVELOPER-NOTES.md                     # Gaps and assumptions
└── README.md                              # This file
```

---

## Key Screens

### P1 — Fully Working (Demo-Critical)
- **Dashboard** (`/`) — Active cases, queue summary, recent activity
- **Cases List** (`/requests`) — All LGOIMA requests with search and filters
- **New Request** (`/requests/new`) — Intake form with auto-deadline calculation
- **Case Detail** (`/requests/[id]`) — Document set overview with bulk actions
- **Document Ingestion** (`/requests/[id]/ingest`) — Bulk upload with progress simulation
- **Document Review** (`/requests/[id]/review/[docId]`) — Split-panel review with AI detections
- **Withholding Schedule** (`/requests/[id]/schedule`) — Auto-generated schedule with PDF preview
- **Audit Trail** (`/requests/[id]/audit`) — Immutable WORM log
- **Export** (`/requests/[id]/export`) — Release package generation

### P2 — UI Present, Limited Functionality
- **Bulk Review** (`/requests/[id]/bulk-review`) — Bulk redaction interface
- **QA Screen** (`/requests/[id]/qa`) — Pre-release quality checks
- **Custom Rules** (`/admin/rules`) — Rule list with editor
- **Settings** (`/admin/settings`) — Multi-tab admin configuration
- **AI Governance** (`/admin/ai-governance`) — Model accuracy metrics

### P3 — Stub/Placeholder
- **Reports** (`/reports`) — Placeholder with coming-soon notice

---

## Demo Flow

See `DEMO-SCRIPT.md` for a detailed 20-minute demo walkthrough with talking points, navigation instructions, and key messages.

**Recommended demo path:**
1. Dashboard → 2. New Request → 3. Cases → 4. Case Detail → 5. Ingestion → 6. Document Review → 7. Withholding Schedule → 8. Audit Trail → 9. Export → 10. AI Governance

---

## Design System

The prototype uses Clarivus brand tokens defined in `tailwind.config.ts`:

- **Primary:** `#3e13af` (Clarivus purple)
- **Accent:** `#1A9F6F` (Clarivus green)
- **Fonts:** Playfair Display (headings), DM Sans (body), JetBrains Mono (mono)
- **Confidence colours:** Green (high), Amber (medium), Red (low)

Component classes are defined in `app/globals.css`: `.btn-primary`, `.btn-secondary`, `.card`, `.badge`, `.input-field`.

---

## Build

```bash
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint check
```

---

## Notes

- This is a demo prototype — no backend, no database, no AI models connected
- All data is static mock data in `lib/mock-data/`
- The document review screen uses a simulated document view (not PDF.js) for reliability
- LGOIMA grounds are accurately sourced from the Act
- See `DEVELOPER-NOTES.md` for gaps and production build considerations
