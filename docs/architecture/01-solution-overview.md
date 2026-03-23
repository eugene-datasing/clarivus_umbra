# Veil — Solution Architecture Overview

**Version:** 1.0
**Date:** March 2026
**Project:** New Plymouth District Council RFP P26-138
**Owner:** DataSing Limited, Wellington, New Zealand

---

## 1. Executive Summary

Veil is an AI-powered LGOIMA disclosure workflow platform that automates the detection, review, redaction, and release of official information under the Local Government Official Information and Meetings Act 1987.

**Purpose-built for New Zealand local government**, Veil addresses the full lifecycle of statutory information disclosure — not merely redaction. It provides:

- Automated detection of personal and commercially sensitive information using Azure OpenAI GPT-4o
- Tiered human review workflow (Subject Matter Expert → Legal → Final Signoff)
- Statutory withholding ground tracking (LGOIMA s6, s7, s17)
- Immutable, hash-chained audit trails for compliance and Ombudsman review
- True PDF content stream redaction (irreversible removal, not visual overlays)
- Export packaging for requesters, internal records, and Ombudsman disclosure

**Hosting and Compliance:**
- Hosted on Microsoft Azure (australiaeast region, Sydney)
- All data processing and storage occurs within Australian data residency boundaries
- Future migration path to Azure nzrnorth (Auckland) region when available
- Built with Next.js 15, PostgreSQL 16, Azure OpenAI GPT-4o, and Azure Document Intelligence

**Deployment Model:**
- Per-client isolated instances (not multi-tenant SaaS)
- Activation gate system for controlled client onboarding
- Containerized deployment on Azure App Service (Linux)

---

## 2. System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         External Systems & Users                        │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         │                            │                            │
    [Browser]                   [SCIM Client]              [Azure AD / Entra ID]
    User Roles:                 (HR System)                 (SSO Provider)
    - Uploader                       │                            │
    - Reviewer                       │                            │
    - Legal                          │                            │
    - Administrator                  │                            │
    - Super Admin                    │                            │
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      │
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Veil Web Application                          │
│                    (Next.js 15 on Azure App Service)                    │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│  │  Web UI Layer   │  │  API Routes     │  │  Auth Middleware │       │
│  │  (Client + RSC) │  │  (Server Actions)│  │  (NextAuth v5)   │       │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘       │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│  │  Processing     │  │  Redaction      │  │  Export Package  │       │
│  │  Pipeline (12)  │  │  Engine (PyMuPDF)│  │  Assembly        │       │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘       │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│  │  Job Queue      │  │  Audit Logger   │  │  Resilience      │       │
│  │  (PostgreSQL)   │  │  (Hash-chained) │  │  (Circuit Breakers)│     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Azure Postgres  │        │  Azure Blob      │        │  Azure OpenAI    │
│  Flexible Server │        │  Storage         │        │  (GPT-4o)        │
│  (PostgreSQL 16) │        │  (Original Files)│        │  (AI Detection)  │
└──────────────────┘        └──────────────────┘        └──────────────────┘
         │                            │                            │
         ▼                            ▼                            ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Azure Document  │        │  Azure Key Vault │        │  Azure Comms     │
│  Intelligence    │        │  (Secrets/Keys)  │        │  Email Service   │
│  (OCR/Layout)    │        │                  │        │  (Notifications) │
└──────────────────┘        └──────────────────┘        └──────────────────┘
         │
         ▼
┌──────────────────┐
│  App Insights    │
│  (Telemetry)     │
└──────────────────┘

All services hosted in Azure australiaeast region (Sydney, Australia)
```

---

## 3. Solution Components

### 3.1 Web Application
- **Framework:** Next.js 15 (App Router, React 19)
- **Language:** TypeScript 5.7
- **Rendering:** Server Components (data fetching), Client Components (interactivity)
- **Routing Strategy:** Force-dynamic (no static generation or ISR) — LGOIMA data must always be fresh
- **Deployment:** Standalone Docker container on Azure App Service (Linux)

### 3.2 Database
- **Engine:** PostgreSQL 16
- **ORM:** Prisma 7 (schema-first, type-safe queries)
- **Schema:** 15 core tables including Document, Finding, AuditLog, User, Job
- **Hosting:** Azure Database for PostgreSQL Flexible Server (australiaeast)
- **Connection Pooling:** Prisma connection pooling (pgBouncer mode for serverless compatibility)

### 3.3 Document Processing Pipeline
A 12-stage sequential pipeline that transforms uploaded documents into reviewable findings:

1. **Validate** — File type, size, virus scan simulation
2. **Extract** — Azure Document Intelligence OCR, layout analysis, text extraction
3. **Patterns** — Regex-based detection (email, phone, NZ driver license, IRD number, bank account)
4. **AI** — Azure OpenAI GPT-4o contextual analysis of high-risk content blocks
5. **Merge** — Combine pattern and AI findings, resolve overlaps
6. **Content Build** — Generate redacted preview PDF (temporary visual overlay for review)
7. **Metadata** — Extract file metadata, sanitization check
8. **Duplicate Detection** — SHA-256 hash comparison (exact duplicates)
9. **Classification** — Document type inference (email, report, spreadsheet, etc.)
10. **Validation** — Quality checks (minimum findings, processing errors)
11. **Notification** — Email alerts to reviewers via Azure Communication Services
12. **Completion** — Mark document as READY_FOR_REVIEW

### 3.4 PDF Redaction Engine
- **Technology:** PyMuPDF (fitz) Python library
- **Integration:** Python subprocess called from Node.js
- **Method:** True content stream removal (not visual overlays)
- **Verification:** Automated irreversibility checks (text extraction post-redaction = empty)
- **Security:** Metadata stripping, hidden content removal, flattened PDF output

### 3.5 Export Package Assembly
Generates three export variants per LGOIMA request:

1. **Requester Package** — Redacted documents + withholding schedule
2. **Internal Package** — Original documents + audit trail + processing metadata
3. **Ombudsman Package** — Both redacted and original + full withholding schedule + audit trail

All packages are ZIP archives with SHA-256 manifests.

### 3.6 Authentication & Authorization
- **Auth Provider:** NextAuth v5 (Auth.js)
- **SSO:** Azure AD (Entra ID) via OpenID Connect
- **Session Storage:** JWT (stateless) with 7-day expiry
- **RBAC:** 5 roles (Uploader, Reviewer, Legal, Administrator, Super Admin)
- **Stale Token Mitigation:** Role re-read from database on every protected route hit
- **User Provisioning:** SCIM 2.0 endpoint for automated HR system sync

**Role Hierarchy:**
```
Super Admin → Administrator → Legal → Reviewer → Uploader
```

### 3.7 Audit Trail
- **Architecture:** Hash-chained immutable log (blockchain-lite pattern)
- **Hashing:** SHA-256 of (previous hash + user ID + timestamp + action + document ID + details)
- **Immutability:** No UPDATE or DELETE operations allowed on audit_logs table
- **Tamper Detection:** Chain verification checks for broken links
- **Retention:** Permanent (aligned with Public Records Act 2005 requirements)

### 3.8 Storage
- **Primary:** Azure Blob Storage (australiaeast, hot tier)
- **Fallback:** Local filesystem (development and air-gapped scenarios)
- **Containers:**
  - `originals` — Source documents (restricted access)
  - `redacted` — Final redacted PDFs
  - `exports` — Release packages (temporary, 30-day retention)
- **Encryption:** AES-256 at rest (Azure Storage Service Encryption)
- **Access Control:** SAS tokens with time-limited expiry (1 hour)

### 3.9 Job Queue
- **Technology:** PostgreSQL-backed persistent queue (jobs table)
- **Pattern:** Producer-consumer with scheduled polling
- **Retry Logic:** 3 attempts with exponential backoff (2s, 4s, 8s)
- **Error Handling:** Failed jobs marked with error message, manual retry available
- **Job Types:** DOCUMENT_PROCESSING, EXPORT_GENERATION, BULK_REDACTION_APPLY

### 3.10 Resilience Layer
- **Circuit Breakers:** Wrap all Azure service calls (OpenAI, Document Intelligence, Blob Storage)
- **Retry Strategy:** Exponential backoff with jitter (3 attempts)
- **Timeout Handling:** 30-second default timeout for AI calls, 60-second for OCR
- **Degradation:** Fallback to pattern-only detection if AI services unavailable
- **Health Checks:** `/api/health` endpoint monitors database, storage, and Azure service connectivity

### 3.11 Email Notifications
- **Service:** Azure Communication Services (Email)
- **Triggers:** Document ready for review, review assigned, export package ready
- **Template Engine:** React Email (type-safe HTML email rendering)
- **Delivery Tracking:** Communication Services provides delivery status webhooks (not yet implemented)

### 3.12 Telemetry
- **Service:** Azure Application Insights
- **Instrumentation:** OpenTelemetry SDK
- **Metrics:** Request duration, Azure service call latency, job processing times
- **Logging:** Structured JSON logs (timestamp, level, message, context)
- **Alerts:** (To be configured) — High error rate, slow processing, circuit breaker open

---

## 4. Key Architectural Decisions

### 4.1 Monolithic Architecture (Not Microservices)
**Decision:** Single Next.js application with all functionality co-located.

**Rationale:**
- Appropriate for proof-of-concept scope and small team size
- Simpler deployment, debugging, and development workflow
- LGOIMA workflow is tightly coupled (splitting into services adds latency and complexity)
- Easier to maintain strong data consistency within a single database transaction

**Trade-offs:**
- Limited horizontal scalability (requires refactor to Service Bus for multi-instance job processing)
- Larger blast radius for failures (mitigated by circuit breakers and health checks)

### 4.2 Server Components First, Client Components for Interactivity
**Decision:** Use React Server Components (RSC) for data fetching and layout, Client Components only where interactivity is required.

**Rationale:**
- Reduces JavaScript bundle size sent to browser
- Improves initial page load performance
- Enables direct database queries from components (no API route boilerplate)
- Better security (database queries never exposed to client)

**Examples:**
- Server: Document list page, audit log viewer
- Client: Multi-select checkbox UI, drag-and-drop upload, redaction annotation editor

### 4.3 PyMuPDF via Python Subprocess for PDF Redaction
**Decision:** Shell out to Python script using PyMuPDF (fitz) for PDF content stream removal.

**Rationale:**
- No Node.js library achieves true content stream removal (most use visual overlays)
- PyMuPDF is industry-standard for forensic-grade redaction
- Subprocess isolation limits Node.js process memory impact
- Python script can be independently tested and versioned

**Trade-offs:**
- Increased deployment complexity (requires Python 3.11+ in Docker container)
- Subprocess overhead (spawn, IPC, cleanup) — acceptable for batch processing
- Error handling across process boundary requires careful design

### 4.4 JWT Sessions with Database Role Re-read
**Decision:** Stateless JWT sessions, but re-read user role from database on every protected route access.

**Rationale:**
- Solves stale token problem (user promoted to admin but JWT still says "reviewer")
- Maintains session scalability (no server-side session store required)
- Avoids forcing user logout after role changes

**Trade-offs:**
- Extra database query per request (mitigated by connection pooling)
- Slight latency increase (typically <10ms)

### 4.5 Activation Gate Pattern for Client Onboarding
**Decision:** Per-client instances provisioned behind activation code system.

**Rationale:**
- Prevents unauthorized access to prototype instances
- Simulates SaaS onboarding workflow for demo purposes
- Allows DataSing to control which organizations can access Veil
- First-user bootstrapping as Super Admin (automatic role assignment)

**Implementation:**
- Activation code entered on signup
- Code validated against database (hashed storage)
- Code can only be used once
- First user with valid code receives Super Admin role

### 4.6 Force-Dynamic Rendering (No Static Generation)
**Decision:** All pages use `export const dynamic = 'force-dynamic'` to disable Next.js static optimization.

**Rationale:**
- LGOIMA data is inherently request-scoped (user roles, document access control)
- Static generation would leak data across user sessions
- Regulatory requirement for "always fresh" data (no stale cache)

**Trade-offs:**
- Higher server load (every request hits database)
- Slower initial page loads (no pre-rendered HTML)
- Mitigated by Server Components (faster than client-side fetching)

---

## 5. Quality Attributes

### 5.1 Security (Defense in Depth)

**Layer 1: Authentication**
- Azure AD SSO (OAuth 2.0 / OpenID Connect)
- MFA enforced at Azure AD level (client responsibility)

**Layer 2: Route Protection**
- NextAuth middleware blocks unauthenticated requests
- Session validation on every page load

**Layer 3: Resource Authorization**
- Database-level checks (user can only see documents they uploaded or are assigned to review)
- Role-based UI rendering (admin-only buttons hidden from non-admins)

**Layer 4: Audit Logging**
- All sensitive actions logged (immutable, hash-chained)
- Who, what, when, why (statutory ground), and outcome

**Additional Measures:**
- Content Security Policy (CSP) headers
- HTTPS-only (no HTTP fallback)
- Secrets in Azure Key Vault (not environment variables)
- SQL injection prevention via Prisma parameterized queries
- XSS prevention via React's automatic escaping

### 5.2 Reliability

**Uptime Target:** 99.5% (RFP requirement)

**Strategies:**
- Circuit breakers on all Azure service dependencies
- Persistent job queue (survives app restarts)
- Retry logic with exponential backoff (3 attempts)
- Health check endpoint for monitoring
- Database connection pooling (prevents connection exhaustion)

**Failure Modes:**
- AI service unavailable → Fallback to pattern-only detection
- Blob storage unavailable → Fail job gracefully, notify admin, retry later
- Database unavailable → App returns 503, Azure App Service auto-restart

### 5.3 Data Sovereignty

**Regulatory Requirement:** Public Records Act 2005, Archives NZ, Data and Statistics Act 2022

**Implementation:**
- All Azure services in **australiaeast region** (Sydney, Australia)
- No data replication to other regions
- Future migration path to **nzrnorth** (Auckland) when Azure region becomes available
- Latency from New Zealand: ~25ms (acceptable for user-interactive workflows)

**Data Classification:**
- LGOIMA requests contain personal information (Privacy Act 2020 applies)
- Some requests may contain Sensitive Personal Information (health, criminal records)
- All data treated as CONFIDENTIAL minimum

### 5.4 Compliance

**LGOIMA 1987:**
- Statutory withholding grounds (s6, s7, s17) modelled in database
- Withholding schedules generated with ground + reasoning
- 20-working-day response clock (future feature: deadline tracking)

**Privacy Act 2020:**
- Principles 6 (access), 11 (security), 12 (unique identifiers)
- Redaction of personal information before release
- Audit trail for privacy breach investigations

**Public Records Act 2005:**
- Original documents retained indefinitely (disposal schedule TBD with client)
- Immutable audit trail (tamper-evident)
- Export packages include metadata for archives transfer

**OWASP Compliance:**
- OWASP Top 10 mitigations (injection, auth, XSS, etc.)
- Dependency scanning (npm audit, Dependabot)
- Secrets scanning (GitHub secret scanning, git-secrets)

### 5.5 Auditability

**Audit Trail Requirements:**
- Immutable (no updates or deletes)
- Tamper-evident (hash-chained)
- Comprehensive (every sensitive action)
- Exportable (CSV, JSON, PDF report)
- Queryable (filter by user, date range, action type, document)

**Audit Log Fields:**
- User ID, timestamp, action, document ID, finding ID (if applicable)
- IP address (future enhancement)
- Statutory ground (if redaction/withholding decision)
- Before/after state (for field changes)
- Hash chain (previous hash → current hash)

### 5.6 Scalability

**Current Limits (Single Instance):**
- Concurrent users: ~20 (B1 App Service plan, 1.75GB RAM)
- Document processing: ~50 pages/minute (GPT-4o rate limits apply)
- Storage: Unlimited (Azure Blob Storage is virtually unbounded)

**Vertical Scaling:**
- App Service: B1 → S1 → P1v3 (up to 14GB RAM, 2 vCPU)
- Database: 1 vCore → 8 vCore (Flexible Server)

**Horizontal Scaling (Future):**
- Requires refactor of job queue to Azure Service Bus (multi-consumer)
- Stateless app design already supports load balancing
- Session state is JWT (no sticky sessions required)

---

## 6. Deployment Model

### 6.1 Instance Isolation (Not Multi-Tenant)

Each client receives a dedicated Veil instance:
- Separate Azure App Service
- Separate PostgreSQL database
- Separate Blob Storage account
- Separate Azure AD app registration (for SSO)

**Rationale:**
- LGOIMA data is extremely sensitive (privacy, legal privilege)
- Regulatory risk of data leakage across tenants is unacceptable
- Client-specific customization (branding, statutory grounds, workflow rules)
- Simpler security model (no tenant ID in every database query)

**Trade-offs:**
- Higher infrastructure cost per client (offset by project fee pricing)
- More complex provisioning (IaC automation required)

### 6.2 Docker Containerization

**Base Image:** node:22-alpine
**Multi-stage Build:**
1. Install dependencies (npm ci)
2. Build Next.js app (next build)
3. Install Python 3.11 + PyMuPDF
4. Copy artifacts to minimal runtime image

**Container Registry:** Azure Container Registry (ACR)
**Image Tagging:** Git SHA + semantic version (e.g., `veil:v1.0.0-9a17745`)

### 6.3 Azure App Service Configuration

**Plan:** Linux B1 (development), P1v3 (production)
**Runtime:** Docker (not Node.js native)
**Environment Variables:** Loaded from Azure Key Vault references
**Startup Command:** `node server.js` (Next.js standalone mode)
**Health Check:** `/api/health` (readiness and liveness probe)

**Auto-Scaling Rules (Future):**
- Scale out when CPU > 70% for 5 minutes
- Scale in when CPU < 30% for 10 minutes
- Min instances: 1, Max instances: 3

### 6.4 CI/CD Pipeline (GitHub Actions)

**Trigger:** Push to `main` branch
**Steps:**
1. Lint (ESLint)
2. Type check (tsc --noEmit)
3. Unit tests (Vitest)
4. Build Docker image
5. Push to ACR
6. Deploy to App Service (staging slot)
7. Smoke tests
8. Swap staging → production

**Deployment Frequency:** On-demand (manual approval required for production)

### 6.5 Activation Code System

**Onboarding Flow:**
1. DataSing provisions new Veil instance (IaC script)
2. DataSing generates activation code (UUID v4, hashed with bcrypt)
3. DataSing sends activation code to client admin (secure channel)
4. Client admin visits Veil URL, enters activation code on signup
5. System validates code, creates user account, assigns Super Admin role
6. Activation code marked as used (cannot be reused)

**Database Schema:**
```sql
CREATE TABLE activation_codes (
  id UUID PRIMARY KEY,
  code_hash TEXT NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP
);
```

---

## 7. Technology Stack Summary

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Next.js | 15.1 | React framework (App Router) |
| | React | 19 | UI library (Server + Client Components) |
| | TypeScript | 5.7 | Type safety |
| | Tailwind CSS | 3.4 | Utility-first styling |
| | Radix UI | 1.x | Accessible component primitives |
| | React Hook Form | 7.x | Form state management |
| | Zod | 3.x | Schema validation |
| **Backend** | Node.js | 22 LTS | JavaScript runtime |
| | Next.js API Routes | 15.1 | API endpoints |
| | Next.js Server Actions | 15.1 | Mutations (form handling) |
| | Prisma | 7.x | ORM (database client) |
| **Database** | PostgreSQL | 16 | Relational database |
| | Azure Postgres Flexible Server | - | Managed database hosting |
| **AI/ML** | Azure OpenAI | GPT-4o | Contextual content analysis |
| | Azure Document Intelligence | 4.0 | OCR, layout analysis |
| **Storage** | Azure Blob Storage | - | Original and redacted files |
| **Authentication** | NextAuth (Auth.js) | 5.x | OAuth/OIDC provider |
| | Azure AD (Entra ID) | - | SSO identity provider |
| **PDF Processing** | PyMuPDF (fitz) | 1.24+ | Content stream redaction |
| | Python | 3.11 | PyMuPDF runtime |
| **Email** | Azure Communication Services | - | Transactional email |
| **Secrets** | Azure Key Vault | - | Secrets and key management |
| **Telemetry** | Azure Application Insights | - | Monitoring and logging |
| | OpenTelemetry | 1.x | Instrumentation SDK |
| **DevOps** | Docker | 27.x | Containerization |
| | Azure Container Registry | - | Private image registry |
| | GitHub Actions | - | CI/CD pipeline |
| **Resilience** | Custom Circuit Breaker | - | Azure service fault tolerance |
| | Retry with Backoff | - | Transient failure handling |
| **Testing** | Vitest | 2.x | Unit testing framework |
| | React Testing Library | 16.x | Component testing |
| | Playwright | 1.x | End-to-end testing (future) |

---

## 8. Next Steps for Architecture Evolution

This document describes the **current state** of the Veil prototype (March 2026). The following architectural enhancements are planned for production readiness:

1. **Horizontal Scalability:**
   - Migrate job queue from PostgreSQL polling to Azure Service Bus
   - Enable App Service scale-out with multi-instance coordination

2. **Performance Optimization:**
   - Implement Redis caching layer (frequently accessed reference data)
   - Batch AI API calls (process multiple findings in single request)
   - Implement progressive document loading (virtualized lists)

3. **Advanced Monitoring:**
   - Application Insights alert rules (error rate, latency, availability)
   - Custom dashboards (processing throughput, AI accuracy metrics)
   - Cost monitoring (Azure OpenAI token usage)

4. **Data Sovereignty:**
   - Migration to Azure nzrnorth region (Auckland) when available
   - Geo-redundant backup to secondary NZ region

5. **Compliance Automation:**
   - LGOIMA 20-working-day deadline tracking and escalation
   - Automated privacy impact assessments (PIA) for high-risk documents
   - Integration with Archives NZ Digital Continuity 2.0 standard

6. **Integration:**
   - Microsoft 365 connector (SharePoint, OneDrive, Outlook)
   - Records management system integration (Objective, HP TRIM)
   - eDiscovery platform integration (Relativity, Nuix)

---

**Document Control:**
- **Author:** DataSing Technical Architecture Team
- **Reviewed by:** [Pending]
- **Approved by:** [Pending]
- **Next Review Date:** [Upon production deployment]

---

*This architecture is designed to meet the requirements of New Plymouth District Council RFP P26-138 while establishing a foundation for Veil as a commercial SaaS product for New Zealand local government.*
