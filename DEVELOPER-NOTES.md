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
- Tables: `cases`, `documents`, `document_pages`, `detections`, `audit_entries`, `file_uploads`, `users`
- Prisma client is a singleton via `globalThis` to survive Next.js dev-mode module reloading

### File Storage
- Local filesystem (`./uploads/{caseId}/{docId}/`) for uploaded documents
- `StorageProvider` interface (`lib/storage/types.ts`) abstracts local vs. Azure Blob — swap via `lib/storage/index.ts`
- API route `app/api/files/[...path]/route.ts` serves files with correct MIME types

### Authentication
- **NextAuth v5** with Credentials provider (email/password) and Azure AD provider (spec'd, not yet wired)
- Edge middleware (`middleware.ts`) protects all routes except `/login` and `/api/auth`
- Role-based access: `requireUser()`, `requireAdmin()`, `authorizeForCase()` in `lib/auth/`
- Session shape: `{ user: { id, name, email, role } }` — provider-agnostic
- Five roles: `admin`, `senior-reviewer`, `request-manager`, `final-approver`, `reviewer`
- See `docs/auth-and-onboarding-spec.md` for the full Azure AD integration plan

### Processing Pipeline
- Fire-and-forget: `POST /api/documents/{docId}/process` triggers `processDocument()` and returns immediately
- Pipeline runs in-process (no external queue) using `globalThis` stores for progress tracking
- Azure Service Bus is provisioned (`sb-veil-prototype` / `document-processing` queue) but not yet integrated into app code
- Status polling via `GET /api/documents/{docId}/status`

---

## 2. What's Working (Real Functionality)

| Feature | Implementation |
|---------|---------------|
| Case creation | Server action → DB insert + audit entry |
| File upload | `POST /api/documents/upload` → local storage + DB row |
| OCR extraction | Azure Document Intelligence (PDFs), mammoth (DOCX) |
| Pattern detection | Regex for NZ IRD, phone, email, NHI, street addresses |
| AI detection | Azure OpenAI GPT-4o with LGOIMA-specific system prompt |
| Content building | Extracted pages + detections → DocParagraph[] for review UI |
| Detection review | Accept/reject with LGOIMA ground assignment via server actions |
| Document status workflow | ready → in-review → reviewed → signed-off (with send-back) |
| Withholding schedule | Auto-generated PDF from accepted detections, grouped by ground |
| PDF redaction | Black rectangles over accepted detections, ground labels, metadata stripped |
| Export packages | ZIP assembly: requester / internal / ombudsman variants |
| Cover letter | PDF with LGOIMA response text and right-of-review notice |
| Audit trail | Immutable audit entries for all actions (case, document, detection, status) |
| Schedule PDF preview | `GET /api/schedule/{requestId}` returns inline PDF |

---

## 3. Design Decisions

### Document Viewer
- **Decision:** Simulated document view (styled HTML paragraphs with highlight spans) instead of PDF.js
- **Reason:** PDF.js adds significant complexity for the POC. The review UI only needs text with detection highlights — the actual PDF rendering is irrelevant for the detection review workflow.
- **For production:** Integrate `@react-pdf-viewer/core` with custom highlight overlay layers mapped to bounding-box coordinates from Azure Document Intelligence.

### Whitespace Normalisation
- **Decision:** `content-builder.ts` normalises non-breaking spaces (`\u00A0`, `\u2007`, `\u202F`, `\u2060`) to regular spaces when matching detection text against paragraph text.
- **Reason:** DOCX extraction via mammoth preserves Word's non-breaking spaces, but GPT-4o normalises them to regular spaces. Without normalisation, `indexOf` fails and detections don't highlight.

### Address Regex Tightening
- **Decision:** Address regex uses `[ \t]+` instead of `\s+` and requires `[a-z]{2,}` for street name words.
- **Reason:** `\s+` crossed newline boundaries causing false positives like "2021\n\n\nDeveloped PL" matching as an address. Minimum word length prevents "he", "PL" etc. from being treated as street components.

### AI Prompt Refinement
- **Decision:** System prompt explicitly tells GPT-4o not to flag headings, labels, or field names that describe PII categories without containing actual PII.
- **Reason:** Without this, terms like "Registered Office Address" were being flagged as address detections.

### Authentication (Credentials-Based)
- **Decision:** NextAuth v5 with Credentials provider. Users log in with email/password. Azure AD SSO is spec'd but not yet wired.
- **Reason:** Credentials auth allows self-contained demo and development without Azure AD tenant access. The auth infrastructure (middleware, session, RBAC) is fully built and provider-agnostic — adding Azure AD requires only wiring the provider and signIn callback.
- **Roles:** admin, senior-reviewer, request-manager, final-approver, reviewer. Middleware enforces admin-only routes. Server actions use `requireUser()` / `requireAdmin()`.
- **See:** `docs/auth-and-onboarding-spec.md` for the full Azure AD integration plan.

---

## 4. Document Status Workflow

Documents transition through these statuses:

```
processing  →  ready  →  in-review  →  reviewed  →  signed-off
                           ↑                |
                           +--- (request ---+
                                changes)
```

| Transition | Trigger |
|-----------|---------|
| `processing → ready` | Pipeline completes extraction + detection |
| `ready → in-review` | Reviewer opens the document review page |
| `in-review → reviewed` | All detections accepted or rejected (auto-computed), or reviewer clicks "Submit to Senior Review" |
| `reviewed → signed-off` | Senior reviewer clicks "Sign Off" |
| `reviewed → in-review` | Senior reviewer clicks "Request Changes" |

Reverting a detection to "pending" on a "reviewed" document automatically regresses it to "in-review".

---

## 5. Remaining Gaps

### Must-Have for Production
| Feature | Status | Notes |
|---------|--------|-------|
| Azure Blob Storage integration | Infrastructure provisioned | Need `BlobStorageProvider` implementing `StorageProvider` interface. Currently using local filesystem (ephemeral in Docker container). |
| Service Bus job queue | Infrastructure provisioned | `sb-veil-prototype` / `document-processing` queue exists. Need to replace `globalThis` in-process queue with `@azure/service-bus` client. |
| Azure AD SSO | Spec complete | Auth infrastructure is built and provider-agnostic. Need app registration + wire `@auth/azure-ad` provider. See `docs/auth-and-onboarding-spec.md`. |
| Real PDF viewer with redaction overlay | Not started | Use `@react-pdf-viewer/core` + custom annotation layer |
| Redaction verification | Not started | Automated check that burned-in redactions cannot be reversed |
| Duplicate detection | Not started | Azure AI Search with similarity scoring |
| Email ingestion (PST/MSG) | Not started | Server-side parsing with `node-pst` or Azure Logic Apps |
| Version comparison | Not started | Side-by-side original vs. draft vs. final |
| Performance benchmarks | Not started | 5,000 pages in 4 hours, 5 concurrent reviewers |
| GitHub Actions CI/CD | Not started | Automate ACR build + App Service deploy on push to main |

### Should-Have
| Feature | Notes |
|---------|-------|
| M365 integration | SharePoint, OneDrive, Outlook connectors |
| Custom rule creation/editing | UI present, rules stored in DB, pipeline integration partial |
| Chain-of-custody reports | Data available, PDF template not built |
| Cost-recovery modelling | Not in prototype scope |
| Real-time collaborative review | Azure SignalR for live status updates |

### Could-Have
| Feature | Notes |
|---------|-------|
| Multimedia redaction | Audio/video/image support |
| eDiscovery integration | External system connectors |
| Records system integration | EDRMS / archives integration |
| Corrupted file detection | File integrity checks during ingestion |

---

## 6. Known UI Issues

1. **Responsive design:** Optimised for 1920x1080 desktop. Below ~1280px, some layouts may overflow.
2. **Keyboard navigation:** Limited — tab order works for forms but detection interactions are mouse-only.
3. **Accessibility:** Basic semantic HTML but ARIA attributes and focus management are not fully implemented. Production must meet NZ Web Standards 1.3 + 1.1.
4. **Dark mode:** Not implemented.
5. **Loading states:** No skeleton screens. Production needs loading, error, and empty states for all data-fetching screens.

---

## 7. LGOIMA Ground Accuracy

The LGOIMA grounds in `lib/lgoima-grounds.ts` are sourced from the Local Government Official Information and Meetings Act 1987:

- **Section 6** — Conclusive reasons (must withhold): s6(a) through s6(d)
- **Section 7** — Other reasons (balanced against public interest): s7(2)(a) through s7(2)(j)
- **Section 17** — Refusal grounds: s17(c), s17(d), s17(e), s17(f)

Each ground includes statutory reference, short label, full description, public interest requirement flag, and common-usage flag.

**For production:** Legal review should confirm descriptions match the current Act text.

---

## 8. Production Build Sequence

Items marked with ✅ are partially or fully complete.

1. ✅ **Azure deployment** — App Service (Linux B1, custom Docker container) + PostgreSQL Flexible Server + Key Vault + ACR + Service Bus + Blob Storage. All in `australiaeast`. Live at https://app-veil-prototype.azurewebsites.net
2. ✅ **Authentication & RBAC** — NextAuth v5 with Credentials provider, middleware route protection, role-based access (`requireUser()` / `requireAdmin()`). **Remaining:** Wire Azure AD provider, user management CRUD, first-run onboarding flow.
3. **Blob Storage integration** — Replace local filesystem with `BlobStorageProvider` (infrastructure provisioned)
4. **Service Bus integration** — Replace in-process job queue with `@azure/service-bus` (infrastructure provisioned)
5. **GitHub Actions CI/CD** — Automate ACR build + App Service deploy + Prisma migrate on push to main
6. **Azure AD SSO** — App registration, wire `@auth/azure-ad` NextAuth provider, signIn callback with OID linking
7. **PDF viewer** — react-pdf-viewer with custom annotation layer and bounding-box overlays
8. **Real-time updates** — Azure SignalR for live detection progress and collaborative review
9. **Duplicate detection** — Azure AI Search with near-duplicate scoring
10. **Email ingestion** — PST/MSG parsing with node-pst or Azure Logic Apps
11. **Admin & governance** — Settings persistence, AI model metrics pipeline
12. **Testing & accessibility** — Full test suite, WCAG 2.1 AA compliance
13. **Performance** — Load testing against RFP benchmarks (5,000 pages / 4 hours)
