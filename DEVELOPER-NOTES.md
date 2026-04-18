# Veil POC — Developer Notes
## Architecture Decisions, What's Working, and Remaining Gaps

---

## 1. POC Architecture

### Server / Client Split
- All data-fetching pages use **async server components** that query PostgreSQL via Prisma, then pass data as props to `"use client"` children for interactivity.
- Server actions (`lib/actions/`) handle mutations (accept detection, create case, sign off document) with optimistic UI updates on the client side.

### Database
- **PostgreSQL 16** (Docker, port 5434) with **Prisma ORM**
- Schema uses a `pg` adapter (`@prisma/adapter-pg`) for connection management
- 19 models: `User`, `Department`, `UserInvitation`, `ActivationCode`, `Case`, `Document`, `DocumentPage`, `Detection`, `DetectionHistory`, `DetectionSnapshot`, `FeedbackExample`, `AuditEntry`, `FileUpload`, `CustomRule`, `SystemSetting`, `CaseMilestone`, `CaseAssignment`, `ExportJob`, `ProcessingJob`
- Prisma client is a singleton via `globalThis` to survive Next.js dev-mode module reloading

### File Storage
- **Azure Blob Storage** is the primary storage provider. `AzureBlobStorageProvider` is implemented in `lib/storage/azure-blob.ts`.
- Local filesystem (`./uploads/{caseId}/{docId}/`) is used as a development fallback.
- `StorageProvider` interface (`lib/storage/types.ts`) abstracts local vs. Azure Blob — swap via `lib/storage/index.ts`
- API route `app/api/files/[...path]/route.ts` serves files with correct MIME types

### Authentication
- **NextAuth v5** with **Azure AD (Entra ID) as the primary provider** and Credentials fallback for development.
- Edge middleware (`middleware.ts`) protects all routes except `/login` and `/api/auth`
- **Post-login activation flow:** Users sign in via Azure AD first, then enter an activation code to bind their account to an organisation. The first user to activate receives the admin role.
- **Domain restriction:** Instance configuration restricts which email domains can sign in via Azure AD.
- **User invitation system:** Admins invite users via email (Azure Communication Services). Invited users receive an activation code and are assigned a role and department on activation.
- **SCIM provisioning:** Endpoints at `/api/scim/Users` and `/api/scim/Groups` support automated user lifecycle management from Azure AD.
- **JWT role staleness handling:** All authorization functions (`requireUser()`, `requireAdmin()`, `authorizeForCase()` in `lib/auth/`) re-read the user's role from the database rather than trusting the JWT claim. This is necessary because the JWT can be stale after activation promotes a user from reviewer to admin.
- Session shape: `{ user: { id, name, email, role } }` — provider-agnostic
- Six roles: `admin`, `request-manager`, `senior-reviewer`, `final-approver`, `reviewer`, plus an implicit unauthenticated state

### Processing Pipeline
- **Persistent job queue** (`lib/queue/job-queue.ts`) with retry logic (3 attempts, exponential backoff) and concurrency control (2 concurrent jobs).
- Processing jobs are stored in the `ProcessingJob` database model for persistence and crash recovery.
- Status polling via `GET /api/documents/[docId]/status` and `GET /api/documents/queue-status`.
- Azure Service Bus is provisioned (`sb-veil-prototype` / `document-processing` queue) but the application currently uses the in-process persistent queue rather than Service Bus.

---

## 2. What's Working (Real Functionality)

| Feature | Implementation |
|---------|---------------|
| Case creation | Server action -> DB insert + audit entry |
| File upload | `POST /api/documents/upload` -> local storage or Azure Blob + DB row |
| OCR extraction | Azure Document Intelligence (PDFs), mammoth (DOCX) |
| Pattern detection | Regex for NZ IRD, phone, email, NHI, street addresses |
| AI detection | Azure OpenAI GPT-4o with LGOIMA-specific system prompt |
| Content building | Extracted pages + detections -> DocParagraph[] for review UI |
| Detection review | Accept/reject with LGOIMA ground assignment via server actions |
| Document status workflow | ready -> in-review -> reviewed -> signed-off (with send-back) |
| Withholding schedule | Auto-generated PDF from accepted detections, grouped by ground |
| PDF redaction | Black rectangles over accepted detections, ground labels, metadata stripped |
| Export packages | ZIP assembly: requester / internal / ombudsman variants |
| Cover letter | PDF with LGOIMA response text and right-of-review notice |
| Audit trail | Immutable audit entries with hash chaining for all actions (case, document, detection, status) |
| Schedule PDF preview | `GET /api/schedule/{requestId}` returns inline PDF |
| Azure AD SSO | Azure AD (Entra ID) as primary auth provider with domain restriction |
| Activation code system | Post-login activation with org metadata binding; first user gets admin |
| Setup wizard | 7-step onboarding: identity, departments, branding, signatory, LGOIMA config, detection policies, team setup |
| User invitations | Email invitations via Azure Communication Services with role/department assignment |
| SCIM provisioning | `/api/scim/Users` and `/api/scim/Groups` endpoints for automated user lifecycle |
| Custom rules | Create, edit, toggle, and test custom detection rules against sample text |
| Duplicate detection | Exact + near-duplicate detection via text similarity scoring |
| Email ingestion | EML and MSG file parsing and ingestion |
| File validation | Corrupted file detection during ingestion |
| Format conversion | Document conversion to consistent review format |
| Version comparison | Side-by-side draft vs. final snapshots |
| AI governance metrics | Dashboard for model accuracy, false positive/negative rates, governance reporting |
| Chain-of-custody reports | PDF report generation with full chain-of-custody detail |
| Cost-recovery modelling | Time tracking and cost allocation for LGOIMA requests |
| QA simulation | Pre-release checks for completeness and compliance |
| Bulk review | Bulk accept/reject detections across multiple documents |
| Processing metrics | Pages/sec throughput, wait times, queue depth tracking |
| CI/CD pipeline | GitHub Actions workflows (ci, docker, migrate) |
| Responsive design | Mobile bottom navigation bar, hamburger menu for admin items |
| Keyboard shortcuts | Review screen: A=accept, R=reject, arrow keys for navigation, Esc to dismiss |
| Landing page | Public-facing product page with feature showcase, demo request form, real screenshots |
| CSRF protection | State-changing API routes require X-Requested-With header; lib/csrf.ts utility |
| Structured logging | All server-side code uses lib/logger.ts — pretty-printed in dev, JSON in production |
| DB-backed rate limiting | Activation rate limiter uses PostgreSQL system_settings instead of in-memory Map |
| LibreOffice conversion | Non-PDF documents (DOCX, XLSX, TXT) converted to PDF at export time for true redaction |
| Self-hosted fonts | Fonts bundled at build time via next/font/google — no runtime Google Fonts CDN dependency |
| Organisation logo | Upload via setup wizard or admin settings, embedded in PDF cover letters, schedules, and chain-of-custody reports |
| PDF viewer | PDF.js-based viewer with detection overlay highlights for PDF documents |
| Document classification | GPT-4o pre-classifies document type and content flags before detection batches |
| Structured DOCX rendering | Headings, bulleted/numbered lists, image placeholders, and full HTML table rendering with cell-level detection |
| Inline type/ground editing | Clickable type badges and improved GroundSelector with section headers on review page |
| Accept remaining bulk action | One-click accept all pending detections with confirmation dialog |
| PNCC demo seed | 11 users, 8 departments, 5 realistic LGOIMA cases (no documents — user uploads real files) |
| Multi-page DOCX redaction | Text-search mode searches ALL pages for each unique detection text, not just declared page |
| PDF macron support | Noto Sans embedded via shared font loader across all 9 PDF generation files |
| Extend deadline | s14 LGOIMA validation with audit trail |

---

## 3. Design Decisions

### Document Viewer
- **Decision:** Dual viewer — PDF.js-based viewer with detection overlay highlights for PDF documents, styled HTML paragraphs with highlight spans for non-PDF documents.
- **Reason:** PDF.js provides accurate rendering of original document layout with detection overlays positioned via bounding-box coordinates. Non-PDF documents use the styled HTML view since they lack bounding-box data from Azure Document Intelligence.
- **For production:** Bounding-box coordinate overlays could be refined for pixel-accurate highlighting on complex PDF layouts.

### Whitespace Normalisation
- **Decision:** `content-builder.ts` normalises non-breaking spaces (`\u00A0`, `\u2007`, `\u202F`, `\u2060`) to regular spaces when matching detection text against paragraph text.
- **Reason:** DOCX extraction via mammoth preserves Word's non-breaking spaces, but GPT-4o normalises them to regular spaces. Without normalisation, `indexOf` fails and detections don't highlight.

### Address Regex Tightening
- **Decision:** Address regex uses `[ \t]+` instead of `\s+` and requires `[a-z]{2,}` for street name words.
- **Reason:** `\s+` crossed newline boundaries causing false positives like "2021\n\n\nDeveloped PL" matching as an address. Minimum word length prevents "he", "PL" etc. from being treated as street components.

### AI Prompt Refinement
- **Decision:** System prompt explicitly tells GPT-4o not to flag headings, labels, or field names that describe PII categories without containing actual PII.
- **Reason:** Without this, terms like "Registered Office Address" were being flagged as address detections.

### Authentication (Azure AD Primary)
- **Decision:** Azure AD (Entra ID) is the primary authentication provider. Credentials provider is retained as a development/demo fallback.
- **Reason:** Azure AD SSO is required for production use and aligns with NPDC's enterprise identity requirements. The auth infrastructure (middleware, session, RBAC) is fully provider-agnostic.
- **Roles:** admin, request-manager, senior-reviewer, final-approver, reviewer. Middleware enforces admin-only routes. Server actions use `requireUser()` / `requireAdmin()`.

### JWT Role Staleness
- **Decision:** All authorization functions re-read the user's role from the database rather than trusting the JWT claim.
- **Reason:** The JWT can be stale after activation promotes a user from reviewer to admin (or after any role change by an admin). Re-reading from the database ensures authorization decisions always reflect the current role.

### Post-Login Activation
- **Decision:** Activation moved from pre-auth to post-auth. The user signs in via Azure AD first, then enters the activation code. The first user to activate receives the admin role.
- **Reason:** This allows Azure AD to handle identity verification while the activation code binds the user to a specific Veil organisation instance. It also simplifies the sign-up flow since the user does not need to create separate credentials.

### Font Self-Hosting
- **Decision:** Switched from `@import url('https://fonts.googleapis.com/...')` in CSS to `next/font/google` in `app/layout.tsx`.
- **Reason:** Google Fonts CDN was returning 503 errors in the Azure-hosted production deployment. `next/font/google` downloads fonts at build time and serves them from the app's own domain, eliminating the external dependency.

### LibreOffice Conversion for Non-PDF Redaction
- **Decision:** At export time, non-PDF documents (DOCX, XLSX, TXT) are converted to PDF via LibreOffice headless, then redacted using PyMuPDF text-search mode.
- **Reason:** Non-PDF documents have no bounding-box data from Azure Document Intelligence. LibreOffice conversion preserves original formatting, then PyMuPDF `page.search_for()` locates detection text in the converted PDF for true redaction. Falls back to plain-text PDF if conversion fails.
- **Three-tier fallback:** (1) Coordinate-based redaction for PDFs, (2) LibreOffice convert + text-search for non-PDFs, (3) Plain-text PDF as last resort.

### Three-Tier PDF Redaction
- **Decision:** PDF originals use coordinate-based redaction (Tier 1) with fallback to text-search (Tier 2) and plain-text PDF (Tier 3).
- **Reason:** Azure DI provides word-level polygons for PDFs, giving precise redaction at exact positions. Non-PDFs lack bounding-box data. Tier 2 (LibreOffice convert + PyMuPU text-search) preserves formatting. Tier 3 is a last resort for when both fail.
- **Known issue:** Tier 1 has two bugs — dedup collapses repeated occurrences, and multi-line detection text produces oversized union bounding boxes. See `docs/tier1-redaction-investigation.md`.

### Document Classification
- **Decision:** A single GPT-4o call classifies document type and content flags before page-level detection batches.
- **Reason:** Detection batches run 3 pages at a time and lack document-level context. The classification (document type, likely grounds, content flags like legal-advice, personnel-info, commercial, cultural, enforcement) is injected into every subsequent batch prompt.

### Detection Deduplication
- **Decision:** All three detection sources (pattern, AI, custom rules) are unified into a single list and deduplicated by `(page, type, text.toLowerCase().trim())` before DB insertion.
- **Reason:** Pattern and AI detection overlap on the same entities. Custom rules can duplicate pattern matches. The dedup keeps the highest-confidence match per key.
- **Known issue:** Coordinates are not in the key, so distinct occurrences of the same text at different positions on the same page are collapsed to one.

### CSRF Protection
- **Decision:** Added `X-Requested-With: XMLHttpRequest` header requirement for state-changing API routes.
- **Reason:** Browsers won't send custom headers cross-origin without CORS preflight, preventing cross-site request forgery. Implemented via `lib/csrf.ts` utility applied to upload, process, and export routes.

### CSP Policy
- **Decision:** `script-src` includes `'unsafe-inline'` in production.
- **Reason:** Next.js requires inline scripts for hydration. Removing `'unsafe-inline'` broke the application with "Connection closed" errors. Next.js does not yet support clean nonce-based CSP.

---

## 4. Document Status Workflow

Documents transition through these statuses:

```
processing  ->  ready  ->  in-review  ->  reviewed  ->  signed-off
                           ^                |
                           +--- (request ---+
                                changes)
```

| Transition | Trigger |
|-----------|---------|
| `processing -> ready` | Pipeline completes extraction + detection |
| `ready -> in-review` | Reviewer opens the document review page |
| `in-review -> reviewed` | All detections accepted or rejected (auto-computed), or reviewer clicks "Submit to Senior Review" |
| `reviewed -> signed-off` | Senior reviewer clicks "Sign Off" |
| `reviewed -> in-review` | Senior reviewer clicks "Request Changes" |

Reverting a detection to "pending" on a "reviewed" document automatically regresses it to "in-review".

---

## 5. Known Bugs

No open bugs. The three Tier 1 PDF redaction bugs previously listed here (per-occurrence dedup collapse, oversized multi-line bboxes, no text-length filter) were resolved in April 2026 — see `calculateBBoxAll` / `computeBoxesFromWords` in `lib/pipeline/bbox.ts` and the bbox-before-dedup block in `processDocument` in `lib/pipeline/process.ts`. Background investigation is archived in `docs/tier1-redaction-investigation.md`.

---

## 6. Remaining Gaps

### Must-Have for Production

| Feature | Status | Notes |
|---------|--------|-------|
| Fix Tier 1 PDF redaction dedup | Resolved (April 2026) | `processDocument` now enriches detections with `calculateBBoxAll` before dedup and keys dedup on `(page, type, text, posY_rounded)`. |
| Fix Tier 1 oversized bounding boxes | Resolved (April 2026) | `computeBoxesFromWords` now splits matched words by `yTolerance` into visual lines and emits one bbox per line; detection text >80 chars falls through to Tier 2. |
| Service Bus job queue | Infrastructure provisioned | `sb-veil-prototype` / `document-processing` queue exists. Currently using in-process persistent queue (`lib/queue/job-queue.ts`). Need to replace with `@azure/service-bus` client for production-grade reliability. |
| Performance benchmarks | Infrastructure exists | Processing metrics and concurrency control are built. Not yet validated at scale against RFP targets (5,000 pages in 4 hours, 5 concurrent reviewers). |

### Should-Have

| Feature | Notes |
|---------|-------|
| Real-time collaborative review | Azure SignalR for live status updates during concurrent review sessions |
| Tier 1 overdrawn-rectangle sanity fallback | Post-Tier-1 check: if any redaction has `posW > 40%` or `posH > 5%`, retry via text-search for that subset |

### Could-Have

No outstanding items. Previous could-have features (corrupted file detection, multimedia extraction infrastructure, eDiscovery connector, records system connector) have been implemented.

---

## 7. Known UI Issues

1. **Responsive design:** Implemented. Mobile bottom navigation bar and hamburger menu for admin items. Desktop layouts optimised for 1920x1080.
2. **Keyboard navigation:** Implemented for the review screen (A=accept, R=reject, arrow keys for detection navigation, Esc to dismiss). Tab order works for forms.
3. **Accessibility:** Improved — ARIA labels, focus management, semantic HTML, skip-to-content link. Still needs a full WCAG 2.1 AA audit to confirm compliance with NZ Web Standards 1.3 + 1.1.
4. **Dark mode:** Not implemented.
5. **Loading states:** Mostly implemented with skeleton screens and spinners. A handful of edge-case screens may still lack loading or empty states.

---

## 8. LGOIMA Ground Accuracy

The LGOIMA grounds in `lib/lgoima-grounds.ts` are sourced from the Local Government Official Information and Meetings Act 1987:

- **Section 6** — Conclusive reasons (must withhold): 4 grounds, s6(a) through s6(d).
- **Section 7** — Other reasons (balanced against public interest): 14 grounds — s7(2)(a), s7(2)(b)(i), s7(2)(b)(ii), s7(2)(ba), s7(2)(c)(i), s7(2)(c)(ii), s7(2)(d), s7(2)(e), s7(2)(f)(i), s7(2)(f)(ii), s7(2)(g), s7(2)(h), s7(2)(i), s7(2)(j).
- **Section 17** — Refusal grounds: 9 grounds — s17(a), s17(b), s17(c)(i), s17(c)(ii), s17(d), s17(e), s17(f), s17(g), s17(h).

Each ground includes statutory reference, short label, full description, public interest requirement flag, and common-usage flag.

**For production:** Legal review should confirm descriptions match the current Act text.

---

## 9. Production Build Sequence

Items marked with checkmarks are complete.

1. **Azure deployment** — DONE. App Service (Linux B1, custom Docker container) + PostgreSQL Flexible Server + Key Vault + ACR + Service Bus + Blob Storage. All in `australiaeast`. Live at https://veil.datasing.nz. Current image: `cr10`.
2. **Authentication & RBAC** — DONE. Azure AD SSO working as primary provider, SCIM provisioning at `/api/scim/Users` and `/api/scim/Groups`, activation code system, user invitations via Azure Communication Services. Credentials fallback for development.
3. **Blob Storage integration** — DONE. `AzureBlobStorageProvider` implemented in `lib/storage/azure-blob.ts`. Local filesystem as dev fallback.
4. **GitHub Actions CI/CD** — DONE. 3 workflows: ci (lint/test/typecheck), docker (ACR build + App Service deploy), migrate (Prisma migrations).
5. **Azure AD SSO** — DONE. Working with domain restriction, post-login activation flow, JWT role staleness handling.
6. **Duplicate detection** — DONE. Exact + near-duplicate detection via text similarity scoring.
7. **Email ingestion** — DONE. EML + MSG parsing and ingestion.
8. **Admin & governance** — DONE. Settings persistence via `SystemSetting` model, AI governance metrics dashboard, custom rules management.
9. **Document classification** — DONE. GPT-4o pre-classifies document type and content flags, context injected into detection batches.
10. **Structured DOCX rendering** — DONE. Headings, lists, tables with cell-level detection highlighting.
11. **PNCC demo seed** — DONE. 11 users, 8 departments, 5 cases, no seeded documents.
12. **Tier 1 PDF redaction fixes** — DONE (April 2026). Per-occurrence dedup (bbox before dedup), line-aware bounding boxes, and 80-character length filter. See `docs/tier1-redaction-investigation.md` for the original investigation.
13. **Service Bus integration** — REMAINING. Replace in-process persistent queue with `@azure/service-bus` for production-grade job processing.
14. **Real-time updates** — REMAINING. Azure SignalR for live detection progress and collaborative review.
15. **Testing at scale** — REMAINING. Load testing against RFP benchmarks (5,000 pages / 4 hours, 10,000 doc duplicate detection / 1 hour, 5 concurrent reviewers).
