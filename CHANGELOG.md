# Changelog

All notable changes to the Veil prototype.

---

## 2026-03-28

### Fixed
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
