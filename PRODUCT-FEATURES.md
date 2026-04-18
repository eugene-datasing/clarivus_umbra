# Veil — AI-Powered Document Redaction & Disclosure Platform

**Not Just Redaction. Defensible OIA & LGOIMA Disclosure.**

Veil automates the detection, review, and release of official information — transforming weeks of manual processing into hours of intelligent, auditable workflow. Purpose-built for New Zealand local and central government.

A DataSing Clarivus Product | [veil.datasing.nz](https://veil.datasing.nz)

---

## The Problem

Every council and government agency in New Zealand faces the same disclosure challenge:

- **Volume overload** — 1,000 to 10,000+ documents per request. Manual review cannot scale.
- **Consistency gap** — Different staff apply redactions differently. No standardised workflow.
- **Defensibility risk** — No structured audit trail linking redactions to statutory grounds.
- **Deadline pressure** — 20 working days. Every OIA/LGOIMA request is a ticking clock.
- **Double-edged risk** — Miss a redaction and it's a privacy breach. Over-redact and it's withholding official information.

Generic redaction tools highlight and remove text. They don't understand New Zealand legislation, don't enforce statutory compliance, and don't produce the evidence trail an Ombudsman investigation demands.

---

## What Veil Does

Veil is a complete statutory disclosure workflow platform. It handles the entire pipeline from document ingestion through to compliant release — with AI detection, human review, and an immutable audit trail at every step.

### Dual-Layer AI Detection

Two detection engines work together. Neither makes final decisions.

**Pattern matching** catches structured PII with deterministic accuracy — IRD numbers (with check digit validation), NHI identifiers, email addresses, phone numbers (NZ-specific formats), physical addresses, bank accounts, and vehicle registrations.

**Contextual AI** (Azure OpenAI GPT-4o) reads documents the way a reviewer would — identifying commercially sensitive content, legal professional privilege, free and frank opinions, and personal information in narrative text. Every detection includes a confidence score and plain-language reasoning explaining why it was flagged.

Every detection is a recommendation. Humans always decide.

### Full OIA & LGOIMA Compliance

Statutory grounds are built into the platform, not configuration options.

- **Section 6** (conclusive reasons) — no public interest balance required
- **Section 7** (other reasons) — mandatory public interest consideration enforced before any redaction can proceed
- **Section 17** (refusal reasons) — structured refusal workflow

Reviewers cannot export a document without linking every redaction to a statutory ground and providing reasoning. The system enforces what policy manuals can only suggest.

**Withholding schedules** are generated automatically from review decisions — in both requester and Ombudsman-ready formats. No manual compilation. No missed entries.

### Tiered Review Workflow

The same approval chain your organisation already uses, built into the system:

1. **Reviewer** — Reviews AI detections, accepts or rejects recommendations, selects statutory grounds, provides reasoning
2. **Senior Reviewer** — Reviews decisions for legal consistency, can modify or override, ensures statutory grounds are correctly applied
3. **Final Approver** — Signs off the release package. Cannot modify redactions — enforcing separation of duties

Full version comparison and change tracking at every stage. Every modification recorded with who, when, and why.

### Permanent, Verified Redaction

Content is removed at the data level, not overlaid with black boxes.

Multi-pass verification confirms redaction integrity before any document leaves the system:
- Text extraction confirms redacted areas return empty
- Object layer analysis checks for hidden content
- Metadata residue scanning removes tracked changes, comments, and embedded objects
- Image/pixel replacement verification ensures no visual residue

If any check fails, export is blocked. No exceptions.

### Immutable Audit Trail

Every action logged. Every decision captured. Every ground recorded.

- SHA-256 hash chain links each entry to the previous — any tampering breaks the chain and is immediately detectable
- Write-Once-Read-Many (WORM) storage with 7-year retention
- Structured fields: user ID, timestamp, role, action, target, reasoning, statutory ground
- Automatic PII sanitisation — sensitive content detected in free-text fields is stripped before storage

There is no "off the record" mode. The audit trail is designed to withstand Ombudsman investigation.

### Bulk Processing at Scale

| Benchmark | Design target |
|-----------|---------------|
| 5,000 pages processed | Under 3 hours |
| 10,000 document duplicate detection | Under 45 minutes |
| Concurrent reviewers | 10+ without degradation |

Ingestion, detection, and export pipelines run independently with queue-driven parallelism. The system scales horizontally — no manual capacity provisioning required. Figures above are architectural design targets; full scale-validation against the RFP benchmarks is planned before production rollout.

---

## Document & Format Support

- **Office documents** — PDF, DOCX, XLSX, PPTX, TXT, RTF, HTML
- **Email archives** — MSG and EML with attachment extraction and thread grouping (for `.pst` archives, export individual `.msg` or `.eml` files before upload)
- **Scanned documents** — OCR with 99%+ accuracy for printed text, 85-95% for handwriting
- **Hidden content** — Automatic detection and sanitisation of comments, tracked changes, hidden sheets, embedded objects, and document metadata
- **Duplicate detection** — Exact match (SHA-256 hash) and near-duplicate (vector similarity at 85% threshold)

---

## Export & Release Packages

Three export types for different audiences:

| Package | Contents |
|---------|----------|
| **Requester** | Redacted documents + withholding schedule + cover letter |
| **Internal** | Above + unredacted originals + full audit trail |
| **Ombudsman** | Complete evidence package for investigation response |

All documents exported as PDF/A-2b for long-term archival compliance. Batch export supports 500+ page documents with configurable splitting.

---

## Reports & Analytics

- **AI Detection Accuracy** — Precision, recall, false positive/negative rates, entity breakdown with confidence distribution
- **LGOIMA Compliance Summary** — Cases by status, statutory grounds usage, completion rates
- **Reviewer Workload Analysis** — Documents reviewed, detections handled, activity breakdown per reviewer
- **Withholding Schedule** — Auto-generated per case with statutory ground linkage
- **Chain of Custody** — Complete document lifecycle from ingestion to release
- **Cost Recovery** — Time tracking for automated vs. manual effort, supporting charging models

---

## Security & Data Sovereignty

### Your Data. In-Region. Always.

Veil is currently hosted in **Azure Australia East (Sydney)**. **Azure New Zealand North (Auckland)** is available as a deployment-time choice for customers who require in-country residency — data residency is a deployment decision made with the customer before cutover.

- DataSing is Wellington-based. No offshore contractors access your data.
- Production region (AU East or NZ North) is locked at deployment; pairing region is configurable for disaster recovery
- Microsoft confirmed: no customer data used for AI model training

### Authentication & Access

- **Azure AD / Entra ID SSO** — OpenID Connect (primary), SAML 2.0 (fallback)
- **MFA** — Honoured via Azure AD Conditional Access policies
- **SCIM 2.0** — Automated user provisioning and deprovisioning from Entra ID
- **RBAC** — Six distinct roles mapped to Azure AD security groups

### Encryption

- **At rest** — AES-256 with customer-managed keys in Azure Key Vault (HSM-backed)
- **In transit** — TLS 1.3 on all communications (minimum TLS 1.2)

### Compliance

| Standard | Status |
|----------|--------|
| OIA 1982 | Built-in statutory ground enforcement |
| LGOIMA 1987 | Built-in statutory ground enforcement |
| Privacy Act 2020 | Audit trail evidence, configurable retention, breach notification support |
| Public Records Act 2005 | WORM storage, General Disposal Authority alignment, Archives NZ export |
| NZ Web Usability Standard 1.3 | Plain language, consistent navigation, user-controllable timeouts |
| WCAG 2.1 Level AA | Keyboard navigation, screen reader support, 4.5:1 contrast ratio |
| OWASP Top 10 | All categories addressed, annual independent penetration testing |

### Security Operations

- Annual penetration testing by NZISM-accredited provider
- Continuous vulnerability scanning in CI/CD pipeline
- Critical patches within 72 hours
- All security events logged to Azure Monitor

---

## By the Numbers

| | |
|---|---|
| **60-70%** | Reduction in manual redaction effort |
| **200-280 hours** | Staff time saved annually (at 80 requests/year) |
| **5,000 pages** | Processed in under 3 hours (design target) |
| **10,000 documents** | Duplicate detection in under 45 minutes (design target) |
| **10+ reviewers** | Concurrent without performance degradation (design target) |
| **99.5%** | Uptime SLA with service credits |
| **27** | Statutory grounds built into the platform |
| **Customer-chosen** | NZ or AU deployment region |

---

## Service & Support

| Priority | Response Time | Availability |
|----------|--------------|-------------|
| P1 — Critical (system down) | 30 minutes | 24/7 |
| P2 — Major (feature impaired) | 2 hours | NZ business hours |
| P3 — Moderate (workaround available) | 4 hours | NZ business hours |
| P4 — Minor (cosmetic/enhancement) | 1 business day | NZ business hours |

**Included with every subscription:**
- Named account manager
- Quarterly service reviews (performance, AI accuracy, support metrics, roadmap)
- Role-based training sessions (administrator, reviewer, request manager, auditor)
- Post-go-live intensive support (1 week) + pilot support (4 weeks)
- AI model updates, security patching, and continuous product improvement
- All Azure infrastructure costs — no variable cloud charges

---

## Implementation

Fixed-price implementation. No surprises.

| Phase | Scope |
|-------|-------|
| **Discovery** | Requirements validation, Azure AD integration planning, workflow mapping |
| **Configuration** | Entra ID SSO + SCIM, role mapping, custom rules, department structure |
| **Data migration** | Historical request import (if applicable), user provisioning |
| **Training** | 8 role-based sessions covering all user types |
| **Pilot** | Live operation with real requests, DataSing on-site support |
| **Go-live** | Full production handover with 4-week stabilisation period |

---

## Why Veil

| | Generic Redaction Tools | Enterprise eDiscovery | **Veil** |
|---|---|---|---|
| OIA/LGOIMA workflow | Manual | Configurable | **Built-in, enforced** |
| NZ data sovereignty | Varies | Typically offshore | **Absolute — NZ only** |
| AI detection | Basic pattern only | General NLP | **Dual-layer: NZ patterns + contextual AI** |
| Withholding schedules | Manual compilation | Manual compilation | **Auto-generated** |
| Tiered review | Manual routing | Configurable | **Built-in with separation of duties** |
| Audit trail | Basic logging | Configurable | **WORM + SHA-256 hash chain** |
| Ombudsman-ready export | Manual assembly | Manual assembly | **One-click package generation** |
| NZ-based support | Varies | Typically offshore | **Wellington-based team** |
| Price | Low tool cost, high labour | $750K-$1.2M+ | **Mid-range, all-inclusive SaaS** |

---

## About DataSing

DataSing builds intelligent data products for New Zealand organisations. Wellington-based, 100% NZ team, all company tax paid in New Zealand.

Veil is part of the **Clarivus AI** product suite — purpose-built tools that bring AI capability to specific, high-value government and enterprise workflows.

**Contact:** [veil.datasing.nz](https://veil.datasing.nz)
