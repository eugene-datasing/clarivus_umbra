# VEIL — 20-Minute Demo Script
## LGOIMA Disclosure Workflow Platform — DataSing / Clarivus AI
### Demo Tenant: Palmerston North City Council (PNCC)

---

## Pre-Demo Setup

### Option A: Azure (Recommended for External Demos)

1. Open https://veil.datasing.nz in Edge or Chrome (full-screen, no bookmarks bar)
2. Click **"Sign in with Microsoft"** to authenticate via Azure AD
3. If this is the first time the instance has been set up, you will be prompted for an activation code (format: `VEIL-XXXX-XXXX-XXXX`). Enter the code provided by DataSing -- this is a one-time step. Skip if already activated.
4. Ensure sidebar is expanded (not collapsed)
5. Have a test document ready (PDF or DOCX with some PII) for the live upload demo
6. Have this script on a second screen or printed

**Note:** The Azure deployment is seeded with PNCC data: 11 users, 8 departments, 5 realistic LGOIMA cases (no documents — upload real files during demo).

### Option B: Local Development

1. Ensure Docker is running: `docker compose up -d`
2. Run `npm run dev` from the `veil-prototype/` directory
3. Open http://localhost:3000 in Edge or Chrome (full-screen, no bookmarks bar)
4. Sign in with the demo credentials available on the login page (credentials login is available in local development)
5. If this is the first time running locally, you will be prompted for an activation code (format: `VEIL-XXXX-XXXX-XXXX`). Enter any valid code -- this is a one-time step. Skip if already activated.
6. Ensure sidebar is expanded (not collapsed)
7. Have a test document ready (PDF or DOCX with some PII) for the live upload demo
8. Have this script on a second screen or printed

**Pre-demo data reset (optional, local only):**
```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead" DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx prisma migrate reset --force
```

**Azure DB reset:**
```bash
DATABASE_URL="postgresql://veiladmin:<password>@psql-veil-prototype.postgres.database.azure.com:5432/veil?sslmode=require" \
  PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead" npx prisma migrate reset --force
```

**Talking points to weave throughout:**
- NZ-hosted (Azure Australia East currently, NZ North available) — data stays in NZ/AU
- Purpose-built for LGOIMA, not generic redaction
- Immutable audit trail for Ombudsman defensibility
- AI assists, humans decide — every action is accountable
- Real database, real AI, real PDF redaction — this is a working system

---

## [0:00-2:00] Dashboard — The Command Centre

**Navigate to:** `/` (loads by default)

### What to say:
> "This is Veil's dashboard — the operational hub for your LGOIMA team. At a glance, you can see active cases, documents pending review, upcoming deadlines, and any overdue items."

### What to highlight:
- **Stat cards** at the top: Active Cases, Docs Pending, Due This Week, Overdue
- **Active Cases list** — each case shows:
  - LGOIMA reference number (e.g., LGOIMA-2026-042)
  - Status badge (In Review, Ingestion, etc.)
  - Days remaining with colour coding (green = safe, amber = soon, red = urgent)
  - Progress bar showing documents reviewed vs. total
- **Recent Activity feed** — shows real entries from the audit trail (not hardcoded), including AI actions
  - Point out: "Notice that AI actions are logged alongside human actions — full transparency"
- **Notifications bell** (top-right) — shows real audit trail entries, not mock data

### What to click:
- Hover over a case card to show the interactive highlight
- Click **"View all"** arrow to transition to the Cases list

---

## [2:00-4:00] New Request Intake

**Navigate to:** Click **"New Case"** in the sidebar

### What to say:
> "When a new LGOIMA request arrives, the officer creates a case in Veil. This form creates a real database record — the case is immediately available across the system."

### What to highlight:
- **Auto-generated reference** number (LGOIMA-2026-XXX)
- **Statutory deadline** auto-calculated at +20 working days from receipt
- **Department assignment** — can tag multiple departments
- **Priority and description** fields
- Requester details (name, organisation, email)

### What to click:
- Fill in sample values and submit — the case is created in the database
- Point out the deadline calculation: "Veil automatically calculates the 20-working-day statutory deadline"
- Navigate to the newly created case

---

## [4:00-7:00] Document Upload & Live Processing

**Navigate to:** The new case's ingest page, or `/requests/[case-id]/ingest`

### What to say:
> "Once a case is created, officers upload the relevant document set. Watch what happens — this is live processing, not a simulation."

### Live demo:
1. **Drag and drop** a real PDF or DOCX into the upload zone
2. **Watch the processing pipeline** in real time:
   - File uploads to the server
   - File validation checks format and integrity
   - Format conversion to standardised review format
   - Status shows "Processing"
   - Duplicate detection checks against existing documents in the case
   - Metadata sanitisation strips hidden content
   - Azure Document Intelligence extracts text (OCR) with word-level polygons
   - Document classification: GPT-4o classifies document type and content flags
   - Regex patterns detect structured PII (IRD numbers, phones, emails, bank accounts, etc.)
   - GPT-4o analyses text for contextual detections (names, commercial content, legal privilege) with document-level context
   - Custom rules applied
   - Detections deduplicated across all sources
   - Status changes to "Ready for Review"
3. Point out: "That entire pipeline — validation, classification, OCR, pattern matching, AI analysis, and custom rules — just ran against real Azure services. The detections are now stored in the database."
4. **Resilience point:** "The job queue has built-in retry logic — if any step fails, Veil retries up to 3 times before flagging an error. This is important for bulk processing at scale."

### Then navigate to Case Detail: `/requests/[case-id]`

### What to highlight:
- **Document table** showing the uploaded document with:
  - Detection count from real AI analysis
  - Status: "Ready for Review" (amber badge)
  - File type, page count
- "Each document moves through a defined workflow: Ready, In Review, Reviewed, Signed Off"

---

## [7:00-12:00] Document Review — The Centrepiece

**Navigate to:** Click the uploaded document to enter review

> **This is the most important screen. Spend the most time here.**

### What to say:
> "This is the heart of Veil — the document review screen. When I opened this document, its status automatically changed from 'Ready' to 'In Review'. Every state transition is tracked."

### What to highlight:

**Split-panel view:**
- **Left panel (Original)** — full document content as extracted by OCR
- **Right panel (Redacted)** — same document with colour-coded highlights showing AI detections:
  - Green highlights = high confidence (>= 85%)
  - Amber highlights = medium confidence (50-84%)
  - Red highlights = low confidence (< 50%)
  - Each highlighted entity is clickable

**Detection panel (bottom):**
- Tabbed view: All | Personal | Commercial | Other
- Each detection shows: entity text, type, confidence score, page, suggested ground
- Click a row to scroll to the detection in the document view

### What to click (detailed walkthrough):

1. **Click a highlighted entity** (e.g., a personal name)
   - Show the detection in the bottom panel
   - "Veil shows the AI's reasoning — why it flagged this text and what ground it suggests"

2. **Accept a detection** — click the green checkmark
   - Show the statutory ground selector appearing
   - "When you accept a redaction, Veil requires you to link it to a specific LGOIMA ground. This is what makes your withholding schedule defensible."
   - Select **s7(2)(a) — Privacy of natural persons**
   - "This decision is immediately saved to the database and recorded in the audit trail"

3. **Reject a detection** — click the red X on an item
   - The rejected detection shows with a dashed border and reduced opacity (not strikethrough)
   - "Not every AI detection is correct. The reviewer rejects this — and that decision is also logged."

4. **Keyboard shortcuts** — mention for efficiency:
   - Press **A** to accept the selected detection
   - Press **R** to reject the selected detection
   - Use **arrow keys** to navigate between detections
   - "Power users can fly through detections without touching the mouse"

5. **Manual detection** — select text in the document to add a detection manually
   - "If the AI missed something, reviewers can highlight text and add their own detection with a ground"

6. **Version comparison** — click the **Compare** tab
   - "Reviewers can compare the original, draft redacted, and final redacted versions side by side"

7. **Accept all remaining detections** to show the workflow progression
   - "Notice the stats in the header update: accepted, rejected, pending counts"
   - When all detections are actioned, point out: "The document status has automatically moved to 'Reviewed'"

8. **Submit to Senior Review**
   - Click the "Submit to Senior Review" button
   - "The initial reviewer has completed their work. Now it goes to the senior reviewer for sign-off."

9. **Show the Senior Review workflow**
   - The button area now shows "Awaiting Senior Review" with two options:
   - **Sign Off** (green) — "The senior reviewer approves all decisions"
   - **Request Changes** — "Or they can send it back with a reason, which moves it back to 'In Review'"
   - Click **Sign Off** to demonstrate
   - "The document is now 'Signed Off' — this is recorded in the audit trail with the senior reviewer's identity"

---

## [12:00-15:00] Withholding Schedule

**Navigate to:** `/requests/[case-id]/schedule`

### What to say:
> "The withholding schedule is generated automatically from the review decisions. Every redaction links back to its statutory ground."

### What to highlight:
- **Covering statement** — editable text block for the response letter
- **Schedule items table** — each row shows:
  - Document name
  - Page reference
  - Description of what was withheld
  - LGOIMA ground (e.g., s7(2)(a))
  - Expandable reasoning
- **Ground summary** — count of items by ground
- **Right-of-review notice** — standard Ombudsman text

### What to click:
- Click **"Preview as PDF"** — this generates a real PDF from the database
  - "This PDF is generated live from the accepted detections — it's not a template, it's computed from the actual review decisions"
- Point out: "If the Ombudsman investigates, every decision is traceable back to the individual detection, the reviewer who made the call, and the reasoning at the time"

---

## [15:00-17:00] Audit Trail

**Navigate to:** `/requests/[case-id]/audit`

### What to say:
> "Everything in Veil is auditable. The audit trail is immutable — write-once, read-many. No one can edit or delete entries, not even administrators."

### What to highlight:
- **WORM banner** at top — "Immutable Audit Trail"
- **Hash chain integrity** — each entry is cryptographically linked to the previous one
  - "Every entry includes a hash that chains to the prior entry. If anyone tampered with the trail, the chain would break — and Veil would flag it."
- **Timeline entries** — each shows:
  - Timestamp
  - User who performed the action (and their role)
  - Action type with colour-coded icons
  - Details of what changed
- Point out the real entries from the demo: "These are the actual actions we just performed — the case creation, the document upload, each detection we accepted and rejected, the sign-off. All real, all timestamped."

### What to click:
- Scroll through entries
- Use the type filter to show only "Review" or "Status" actions
- **Generate chain-of-custody PDF** — click to produce a downloadable PDF of the full audit trail
  - "This PDF can be submitted directly to the Ombudsman as evidence of your process"

---

## [17:00-18:30] Export & Release

**Navigate to:** `/requests/[case-id]/export`

### What to say:
> "When all documents are reviewed and signed off, Veil generates the final release package with real PDF redaction."

### What to highlight:
- **Three export types:**
  - **Requester** — Redacted documents + withholding schedule + cover letter
  - **Internal** — Adds full audit trail
  - **Ombudsman** — Adds original unredacted documents
- **Export process:**
  - Click to generate
  - Real PDF redaction: permanent black rectangles with LGOIMA ground labels
  - Metadata stripped from all PDFs
  - ZIP package assembled for download

### What to say:
> "The redaction is permanent — the original text is removed from the PDF, not just covered. And each redaction bar shows the withholding ground reference, so the requester knows which section of the Act applies."

---

## [18:30-20:00] Admin & AI Governance

**Navigate to:** `/admin/ai-governance`

### What to say:
> "Finally, Veil provides full transparency into AI performance. This dashboard shows precision, recall, and accuracy metrics by detection type."

### What to highlight:
- **Accuracy metrics** — Precision, Recall, F1 Score
- **Per-entity breakdown** — accuracy varies by type (names vs. IRD numbers vs. addresses)
- **Model governance** — which model is in use, data residency confirmation
- **Settings page** (`/settings`) — shows real users from the database, not mock data
  - **"Edit in Setup Wizard" links** — the setup wizard can be re-entered from Settings to update configuration
- **Custom rules** — can be created, tested against sample text, and toggled on/off

### Closing statement:
> "Veil is purpose-built for LGOIMA. It understands your statutory grounds, your workflow, and your compliance requirements. Built on Azure NZ North, your data never leaves New Zealand. Every AI suggestion is transparent, every human decision is auditable, and your Ombudsman responses are defensible from day one."

---

## Organisational Workflow Summary

Show this diagram if questions arise about how Veil fits into a council's operations:

```
ROLES:
  Coordinator  →  Creates cases, assigns work, manages deadlines
  Reviewer     →  Reviews AI detections, assigns LGOIMA grounds
  Senior       →  Signs off or requests changes
  Approver     →  Final sign-off on complete response package

WORKFLOW PER REQUEST:
  1. INTAKE       →  Case created, deadline set (20 working days)
  2. GATHER       →  Documents uploaded to Veil
  3. PROCESS      →  OCR → Pattern detection → AI detection
  4. REVIEW       →  Accept/reject detections with grounds
  5. SIGN-OFF     →  Senior reviewer approves or sends back
  6. QA           →  Automated compliance checks
  7. EXPORT       →  Redacted PDFs + schedule + cover letter
  8. RELEASE      →  Sent to requester, audit trail preserved

DOCUMENT STATUSES:
  Ready → In Review → Reviewed (Initial) → Signed Off
                ↑            |
                +-- Request --+
                    Changes
```

---

## Key Messages to Reinforce Throughout

| Theme | Message |
|-------|---------|
| **Working system** | This is a real POC — real database, real AI, real PDF redaction |
| **LGOIMA-native** | Built specifically for LGOIMA s6, s7, s17 — not adapted from generic redaction |
| **AI + Human** | AI assists, humans decide — every action is accountable |
| **Tiered review** | Reviewer → Senior Reviewer → sign-off matches council governance |
| **Defensible** | Immutable audit trail, statutory ground linkage, reasoning capture |
| **NZ Data Sovereignty** | Azure NZ North region, data never leaves NZ/AU |
| **Scale** | Handles 1,000-10,000+ documents per request |

---

## Troubleshooting

### Local Development
- **Database not running:** Run `docker compose up -d` and wait 5 seconds
- **Azure services not configured:** Check `.env` has valid endpoints and keys; without them, upload works but AI detection will fail
- **Slow first load:** First page load after `npm run dev` compiles on-demand — allow a few seconds

### Azure Deployment
- **503 error after deploy:** App Service container startup can take 30-60 seconds after a restart. Wait and refresh. URL: https://veil.datasing.nz
- **AI detection failing:** Check Key Vault secret values for `azure-openai-key` and `azure-di-key` are current
- **First login requires activation code:** If you see the activation page, enter the activation code provided by DataSing (format: `VEIL-XXXX-XXXX-XXXX`). This is a one-time setup step.
- **Profile banner:** If you see a "Complete your profile" banner, click the link or click your name in the sidebar to set your department. This only appears until profile setup is complete.

### General
- **Sidebar obscuring content:** Click the collapse arrow at the bottom of the sidebar
- **Screen too small:** Demo should be run at 1920x1080 minimum
