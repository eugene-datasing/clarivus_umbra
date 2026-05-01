> **Umbra (in-flight rework)** — fork of Veil, simplifying to a PII redaction tool for NZ councils and central-government agencies. Full rework plan: [`docs/umbra-implementation-plan.md`](docs/umbra-implementation-plan.md). Until Phase 9 (branding + docs cleanup) lands, this document and most of the codebase retain Veil-era content; the divergence is intentional and tracked.

---

# Changelog

All notable changes to the Veil prototype.

---

## 2026-04-14

### Added
- Document-level classification pipeline (`doc-classify.ts`) — GPT-4o classifies document type and content flags before page-level detection (`8606f67`)
- 7 new detection types: negotiation, safety-concern, law-enforcement, council-commercial, harassment-risk, cultural-sensitivity, health-safety (`8606f67`)
- Structured DOCX rendering with headings (h2-h6), bulleted/numbered lists, image placeholders, and full HTML table rendering (`320a9c0`)
- Per-group review status tracking (pending/partial/accepted/rejected) computed server-side (`320a9c0`)
- Export-time "missing-grounds" readiness check that blocks export when accepted detections lack assigned grounds (`320a9c0`)
- Inline type and ground editing on document review page — clickable type badges, improved GroundSelector with section headers (`4dfd8a6`)
- Accept Remaining bulk action with confirmation dialog and optimistic updates (`4dfd8a6`)
- Extend deadline feature with s14 LGOIMA validation and audit trail (`4dfd8a6`)
- Comprehensive audit trail test suite (213 lines) (`320a9c0`)
- DOCX multi-page redaction test (`c23d049`)

### Changed
- Rewrite seed for Palmerston North City Council demo: 8 departments, 11 users, 5 realistic LGOIMA cases with no documents (`4ac3c82`)
- Pipeline deduplication: combine pattern, AI, and custom rule detections into unified list and deduplicate by (page, type, text) before DB insertion (`2d8f8ed`)
- Restructured AI prompt with detection guidance, worked examples, grounds grouped by detection pathway (`8606f67`)
- DOCX large-page chunking for AI batches, custom rule deduplication, ground format normalisation, Zod validation for all 27 grounds (`8606f67`)
- Wire LGOIMA workflow configuration: split escalation threshold into amber/red warning days, wire defaultResponseDays to new request form (`4dfd8a6`)
- Skip env validation during Next.js production build phase (Azure build doesn't have runtime secrets) (`04bcd79`)

### Fixed
- Fix DOCX redaction to search all PDF pages, not just declared page — Mammoth tags all content as page=1, now Python searches every page for each unique text (`c23d049`)
- Fix audit trail integrity verification — `timestamp without time zone` column + pg driver TZ interpretation mismatch; use raw SQL `to_char` to read exact stored format (`2949864`)
- Fix detection sort order to use first occurrence in document — `Map.set()` was overwriting with last position instead of first (`953a868`)
- Fix bank account misclassification — reorder patterns (most specific first), add negative lookbehind to phone regex (`2d8f8ed`)
- Fix PDF export WinAnsi encoding error for te reo Māori macrons — embed Noto Sans via shared font loader across all 9 PDF generation files (`4dfd8a6`)
- Fix coordinate deduplication to prevent double-redaction of overlapping regions (`320a9c0`)

---

## 2026-04-13

### Added
- Logo upload API and pipeline logo helper for embedding org logo in PDFs (`2d5dd76`)
- LGOIMA reference documents and remediation plan (`732e8e5`)

### Changed
- Replace hardcoded AI governance and report metrics with real data (`e76b8b0`)
- Fix LGOIMA statutory grounds and wire detection toggles into pipeline (`7b88eed`)
- Update documentation: fix README accuracy, add CLAUDE.md context (`3ef12f2`)

### Fixed
- Fix auth session refresh, profile redirect, and setup wizard UX (`6406055`)
- Fix stale s7_2f ground ID in schedule test (`7434c71`)

---

## 2026-04-01

### Fixed
- Fix profile nudge persistence, dynamic document headers, and add content seed (`595e4a4`)

---

## 2026-03-29

### Added
- Automatic PII sanitization in audit trail free-text fields (`2de322c`)
- Sign-out on activate page and instance reset script (`2de322c`)

---

## 2026-03-28

### Added
- All 5 remaining report templates with real PDF generation (`6128c20`)
- Redesign admin settings page: consolidate tabs, fix UX issues (`fd6ef49`)

### Fixed
- Wire up automatic case status transitions from document workflow (`4b5c466`, `5a23da8`)
- Fix sidebar layout shift and filter notification noise (`b29e7bc`)
- Switch Google Fonts to `next/font/google` for build-time bundling — eliminates runtime Google Fonts CDN dependency (`d008ac7`)
- Restore `'unsafe-inline'` in CSP `script-src` for Next.js hydration — fixes production "Connection closed" error (`6c04637`)

---

## 2026-03-27

### Fixed
- Wire up remaining UI placeholders, harden security and logging — Tier 3 improvements (`2bf2251`)
- Wire up non-functional UI elements: filters, audit export, assign reviewer — Tier 2 (`d504e10`)
- Fix critical security vulnerabilities across auth, audit, and CSP — Tier 1 (`a79c12c`)
- Fix review workflow labels, add document exclude/delete, fix department banner (`4272591`)
- Fix Tier 3 PDF encoding error: replace block chars with ASCII marker (`c8f3564`)

---

## 2026-03-26

### Added
- LibreOffice conversion for non-PDF redaction with text-search mode (`663cda7`)

### Fixed
- Fix export persistence and PDF redaction fallback (`e715f25`)

---

## 2026-03-25

### Added
- Landing page for unauthenticated visitors with feature showcase, demo request form, real screenshots (`1be3312`, `c3f8da2`, `1a627b6`, `04dce11`)

### Changed
- Redesign detection highlights: three-state system with black-bar redactions (`c03b2e0`)
- OIA/LGOIMA positioning, profile banner fix, favicon, e2e updates (`14ce9c1`)

---

## 2026-03-24

### Added
- PDF viewer for document review with detection overlays (`94cec6b`)

### Changed
- Switch Docker runtime from Alpine to Debian slim for PyMuPDF compatibility (`86f57ad`)

### Fixed
- Fix seed script and error boundary for authorization errors (`53b6f76`)
- Update documentation to reflect current build state (`9358131`)

---

## 2026-03-23

### Fixed
- Notification dropdown, reject UX feedback, profile navigation, and bulk review button (`9a17745`)

---

## 2026-03-22

### Added
- B1-B8 onboarding flow: post-login activation gate, email invitations, user profile page (`3df314e`)
- P3 production gaps: audit PII sanitisation, user identity model, performance benchmarks (`9482684`)

### Changed
- Login page cleaned up for production with DataSing branding (`451d055`)
- Org name and abbreviation made read-only in setup wizard after initial configuration (`deaa781`)

### Fixed
- Stale JWT authorisation: bootstrap admin role and fix production deployment issues (`bf12d82`)
- Stale JWT role after activation promotion (`7d9268b`)
- `requireAdmin()` re-reads role from DB instead of stale JWT (`3d80aa1`)
- Activation gate hardened with redundant check and diagnostics (`1dbcb81`)
- Middleware auth enforcement and Azure deployment issues (`3cece6d`)
- Document page duplicate constraint and CSP `connect-src` directive (`7b95204`)

---

## 2026-03-21

### Added
- P0 + P1 production readiness: email ingestion (EML/MSG), observability (Application Insights), accessibility improvements, resilience patterns (circuit breakers, retry), CI/CD workflows, test suite (`d9a0bac`)
- P2 production readiness: 12 features for RFP should-have and could-have requirements including cost-recovery reports, chain-of-custody, multimedia extraction framework, records/eDiscovery connectors, progress dashboards (`9be1cb2`)
- Tier 1 + Tier 2 production hardening: Azure infrastructure spec, SSO design, audit integrity with hash chaining, SCIM 2.0 provisioning (`6b9c1fe`)
- Authorisation check added to compare page (`e23f0c1`)

### Changed
- Pipeline configuration: confidence threshold settings, review sync improvements, navigation fixes, auth spec documentation (`de9a89c`)

### Fixed
- Security hardening: activation gate, IDOR fixes, PII sanitisation in logs, XSS prevention (`3188cbb`)
- CI lint migrated from deprecated `next lint` to ESLint CLI (`2e53caa`)

---

## 2026-03-20

### Added
- WP21 + WP22: Client workspace setup wizard and manual redaction with AI learning feedback loop (`51fad39`)
- True PDF redaction via PyMuPDF — text genuinely removed from content stream, not just visually hidden (`5c98fc7`)

### Changed
- UI polish: resizable detections panel, EyeOff logo on login, manual detection highlight fix (`f3982ed`)

### Fixed
- Auth gaps, transaction safety, match length bug (`5eea5d8`)
- FK constraints, race conditions, input validation (`1bcd62c`)
- Prototype hardening: auth, validation, crypto, path safety, tests (`f0a954e`)
- 7 custom rules gaps: type badges, source labels, validation, priority ordering, UX (`f9ab60b`)
- Fix middleware Edge runtime: split auth config from Node.js providers (`22170f1`)
- Fix TS error: wrap Uint8Array in Buffer for NextResponse body (`db54ee1`)

---

## 2026-03-19

### Added
- Initial working prototype with real PostgreSQL persistence, Azure AI pipeline, and complete LGOIMA workflow (`0ffc082`)
- WP1-WP4, WP6-WP7, WP9-WP11: Core gap closure — file validation, format conversion, duplicate detection, metadata sanitisation, QA simulation, AI governance metrics (`01aa5cd`)
- WP5: Version comparison with detection snapshots and diff view (`90504bd`)
- WP8: Custom rules engine with persistence and pipeline execution (`c923c3d`)
- WP12 + WP13: Change tracking (detection history) and processing time instrumentation (`9f01003`)
- WP14: Error handling polish with structured errors and reusable error component (`d69c2a9`)
- WP15: DOCX/XLSX metadata sanitisation for ombudsman export packages (`25bc41b`)
- WP16: Authentication and RBAC foundation with NextAuth v5 (`17615a9`)

### Changed
- Export workflow redesigned with document selection and validation gates (`065146f`)
- Document status workflow, schedule PDF preview, AI prompt improvements, docs update (`6690bb4`)

### Fixed
- Detection highlighting and address regex false positives (`d3f2786`)
