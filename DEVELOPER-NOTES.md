# Veil Prototype — Developer Notes
## Gaps, Assumptions, and Items for Full Build

---

## 1. Prototype Scope Decisions

### Document Viewer
- **Decision:** Used a simulated document view (styled HTML content) instead of `react-pdf` / `pdf.js`
- **Reason:** PDF.js adds significant complexity (worker threads, canvas rendering, font loading) and the spec explicitly allows "a high-quality static representation of a document with overlay" for the prototype
- **For production:** Integrate `@react-pdf-viewer/core` with custom highlight/redaction overlay layers. The overlay architecture (SVG-based highlights, black-bar redactions) designed in the prototype translates directly to PDF coordinate-based overlays.

### Smooth Scrolling (Lenis)
- **Decision:** Not integrated — Lenis is listed in the tech stack but adds no value to a data-heavy disclosure workflow app
- **Reason:** Lenis is designed for marketing/portfolio sites with scroll-based animations. A LGOIMA workflow tool benefits from standard browser scrolling and instant navigation.
- **For production:** No action needed. Standard scroll behaviour is correct for this application type.

### Shadcn/ui
- **Decision:** Used Tailwind utility classes directly with custom component classes (`.btn-primary`, `.card`, `.badge`, `.input-field`) instead of installing shadcn/ui primitives
- **Reason:** The prototype screens are self-contained page components. Shadcn/ui's value emerges in larger applications with shared component libraries and complex interactions (combobox, dialog, popover). For the prototype, direct Tailwind classes are simpler and faster to build.
- **For production:** Install shadcn/ui and migrate to its primitive components (Dialog, Popover, Select, Command, DataTable). This gives better accessibility, keyboard navigation, and consistent API.

### Framer Motion
- **Decision:** Available in dependencies but animations are minimal (CSS transitions only)
- **Reason:** Time prioritised for screen completeness over animation polish
- **For production:** Add Framer Motion for: sidebar collapse/expand, modal enter/exit, detection highlight pulse, status badge transitions, page route transitions.

---

## 2. Mock Data Limitations

### Static Data
- All data is hardcoded in `lib/mock-data/`. No state persists between page navigations.
- Actions (accept, reject, submit) update local React state only — navigating away resets everything.
- The 5 mock requests all reference NPDC-contextualised scenarios (Coastal Walkway, Property Sale, Community Grants, Bell Block bypass, Three Waters).

### Document Content
- The document review screen (`doc-001`) has a single simulated council report with 12 embedded detections.
- Other documents in the set are listed but have no review content — clicking them would show the same simulated document.
- **For production:** Each document needs its own parsed content from Azure Document Intelligence, with detection coordinates mapped to actual PDF page positions.

### Detection Coordinates
- Detections reference text spans rather than page coordinates. In the simulated view, detections are matched by text content.
- **For production:** Detections will have bounding-box coordinates (`{ page, x, y, width, height }`) from Azure Document Intelligence / Azure OpenAI, mapped to the PDF overlay.

---

## 3. Features Not Implemented

### Must-Have (deferred to full build)
| Feature | Notes |
|---------|-------|
| Real PDF viewer with redaction overlay | Use `@react-pdf-viewer/core` + custom annotation layer |
| Permanent redaction burn-in | Server-side PDF manipulation (e.g., `pdf-lib` or Azure-hosted service) |
| Redaction verification | Automated check that burned-in redactions cannot be reversed |
| Duplicate detection (actual) | Azure AI Search with similarity scoring |
| OCR processing | Azure Document Intelligence |
| Email ingestion (PST/MSG/EML) | Server-side parsing with `node-pst` or Azure Logic Apps |
| Multi-document review navigation | Next/previous document within a case |
| Version comparison | Side-by-side original vs. draft vs. final |
| Performance benchmarks | 5,000 pages in 4 hours, 5 concurrent reviewers |
| Real authentication | Azure AD / Entra ID SSO integration |

### Should-Have (not in prototype)
| Feature | Notes |
|---------|-------|
| M365 integration | SharePoint, OneDrive, Outlook connectors |
| Custom rule creation/editing | UI present but create/edit functionality mocked |
| Chain-of-custody reports | Export format defined but not generated |
| Cost-recovery modelling | Not in prototype scope |
| Pre-release QA simulation | Screen present, scan functionality mocked |

### Could-Have (not in prototype)
| Feature | Notes |
|---------|-------|
| Multimedia redaction | Audio/video/image support |
| eDiscovery integration | External system connectors |
| Records system integration | EDRMS / archives integration |
| Corrupted file detection | File integrity checks during ingestion |
| Progress dashboards | Real-time processing metrics |

---

## 4. Known UI Issues

1. **Responsive design:** The prototype is optimised for 1920×1080 desktop. Below ~1280px width, some layouts may overflow. The sidebar is fixed at 260px which limits narrow-screen usability.

2. **Keyboard navigation:** Limited — tab order works for forms but the document review screen's detection interactions are mouse-only in the prototype.

3. **Accessibility:** Basic semantic HTML is in place but ARIA attributes, screen reader announcements, and focus management are not fully implemented. Production must meet NZ Web Standards 1.3 + 1.1.

4. **Dark mode:** Not implemented. The design system uses a single light theme.

5. **Loading states:** No skeleton screens or loading indicators. In production, all data-fetching screens need loading, error, and empty states.

6. **Error handling:** No error boundaries, no form validation feedback (except the new request form), no network error states.

---

## 5. Architecture Decisions for Production

### State Management
- Prototype uses local `useState` per page — fine for mock data
- Production needs: React Query (TanStack Query) for server state, Zustand or React Context for UI state (sidebar, modals, user session)

### API Layer
- No API layer in prototype
- Production: Next.js API routes or separate Azure Functions, with typed API client (tRPC or generated from OpenAPI spec)

### Database
- No database in prototype
- Production: Azure Cosmos DB (as per technical architecture) or Azure SQL for relational audit data

### File Storage
- No file handling in prototype
- Production: Azure Blob Storage with SAS tokens for secure document access, separate containers for originals vs. redacted versions

### Real-time Updates
- No real-time features in prototype
- Production: Azure SignalR Service for live detection progress, review status updates, and collaborative review indicators

### Testing
- No tests in prototype
- Production: Vitest for unit tests, Playwright for E2E, React Testing Library for component tests

---

## 6. LGOIMA Ground Accuracy

The LGOIMA grounds in `lib/lgoima-grounds.ts` are sourced from the Local Government Official Information and Meetings Act 1987. They include:

- **Section 6** — Conclusive reasons (must withhold): s6(a) through s6(d)
- **Section 7** — Other reasons (balanced against public interest): s7(2)(a) through s7(2)(j)
- **Section 17** — Refusal grounds: s17(c), s17(d), s17(e), s17(f)

Each ground includes:
- Statutory reference (e.g., "s7(2)(a)")
- Short label
- Full description from the Act
- Whether it requires public interest consideration (all s7 grounds do)
- Whether it's commonly used or rarely applicable

**For production:** Legal review should confirm the ground descriptions match the current Act text. Some grounds may have been amended or interpreted differently by the Ombudsman.

---

## 7. Build Sequence for Production

1. **Authentication & RBAC** — Azure AD SSO, role-based access, user provisioning
2. **API layer** — Next.js API routes with Azure backend services
3. **Document pipeline** — Upload → OCR → AI detection → storage
4. **PDF viewer** — react-pdf-viewer with custom annotation layer
5. **Real-time detection** — Azure OpenAI integration with streaming results
6. **Review workflow** — Stateful review with tier escalation, assignment, locking
7. **Withholding schedule generation** — Template engine with PDF export
8. **Audit system** — Append-only audit log with WORM compliance
9. **Export pipeline** — Redaction burn-in, verification, package assembly
10. **Admin & governance** — Settings persistence, AI model metrics pipeline
11. **Testing & accessibility** — Full test suite, WCAG 2.1 AA compliance
12. **Performance** — Load testing against RFP benchmarks
