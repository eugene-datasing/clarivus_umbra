# VEIL — 20-Minute Demo Script
## LGOIMA Disclosure Workflow Platform — DataSing / Clarivus AI

---

## Pre-Demo Setup

1. Run `npm run dev` from the `veil-prototype/` directory
2. Open http://localhost:3000 in Edge or Chrome (full-screen, no bookmarks bar)
3. Ensure sidebar is expanded (not collapsed)
4. Have this script on a second screen or printed

**Talking points to weave throughout:**
- NZ-hosted (Azure NZ North) — data never leaves NZ/AU
- Purpose-built for LGOIMA, not generic redaction
- Immutable audit trail for Ombudsman defensibility
- AI assists, humans decide — every action is accountable

---

## [0:00–2:00] Dashboard — The Command Centre

**Navigate to:** `/` (loads by default)

### What to say:
> "This is Veil's dashboard — the operational hub for your LGOIMA team. At a glance, you can see active cases, documents pending review, upcoming deadlines, and any overdue items."

### What to highlight:
- **4 stat cards** at the top: Active Cases (4), Docs Pending (489), Due This Week (2), Overdue (0)
- **Active Cases list** — each case shows:
  - LGOIMA reference number (e.g., LGOIMA-2026-042)
  - Status badge (In Review, Ingestion, etc.)
  - Days remaining with colour coding (green = safe, amber = soon, red = urgent)
  - Progress bar showing documents reviewed vs. total
- **Recent Activity feed** — shows who did what and when, including AI actions
  - Point out: "Notice that AI actions are logged alongside human actions — full transparency"

### What to click:
- Hover over a case card to show the interactive highlight
- Click **"View all"** arrow to transition to the Cases list

---

## [2:00–4:00] New Request Intake

**Navigate to:** Click **"New Case"** in the sidebar

### What to say:
> "When a new LGOIMA request arrives, the officer creates a case in Veil. The form captures all the details needed for tracking, compliance, and audit."

### What to highlight:
- **Auto-generated reference** number (LGOIMA-2026-XXX)
- **Statutory deadline** auto-calculated at +20 working days from receipt
- **Department assignment** — can tag multiple departments
- **Priority and description** fields
- Requester details (name, organisation, email)

### What to click:
- Fill in some sample values (or note they're pre-populated for demo)
- Point out the deadline calculation: "Veil automatically calculates the 20-working-day statutory deadline — no manual counting required"
- Click the sidebar **"Cases"** link to move on

---

## [4:00–7:00] Document Ingestion & Case Overview

**Navigate to:** `/requests` → click the **"Coastal Walkway Extension"** case → click the **Ingest** action or navigate to `/requests/req-001/ingest`

### What to say:
> "Once a case is created, officers upload the relevant document set. Veil handles bulk ingestion — thousands of documents at a time — with automatic OCR, duplicate detection, and metadata extraction."

### What to highlight on Ingestion screen:
- **Drag-and-drop upload zone** — supports PDF, Word, Excel, email formats (PST, MSG, EML)
- **Processing progress** — simulated progress bars showing OCR, duplicate detection, metadata extraction
- **Duplicate detection results** — show how Veil identifies exact and near-duplicate documents
- **Format statistics** — breakdown by file type

### Then navigate to Case Detail: `/requests/req-001`

### What to say:
> "After ingestion, the case detail view shows every document in the set. Officers can see which documents have been reviewed, which have AI detections pending, and filter by status."

### What to highlight:
- **Document table** with columns: name, type, pages, detections, status, reviewer
- **Status indicators** — Pending, In Review, Approved, Flagged
- **Bulk action bar** — select multiple documents, assign reviewer, change status
- **Progress bar** at top showing overall case progress
- Detection count per document: "This document has 12 AI detections that need human review"

### What to click:
- Click on **"NPDC-CW-001 Council Report.pdf"** (or first document) to enter Document Review

---

## [7:00–12:00] Document Review — The Centrepiece

**Navigate to:** `/requests/req-001/review/doc-001`

> **This is the most important screen. Spend the most time here.**

### What to say:
> "This is the heart of Veil — the document review screen. On the left, you see the original document. On the right, a redacted preview showing what the released version will look like. Below, the AI detections panel lists every item Veil has flagged."

### What to highlight:

**Split-panel view:**
- **Left panel (Original)** — full document content with colour-coded highlights:
  - Purple highlights = personal information
  - Blue highlights = commercially sensitive
  - Amber highlights = legal privilege
  - Each highlighted entity is clickable
- **Right panel (Redacted)** — same document with black redaction bars replacing accepted items
  - "This is what the requester will receive"

**Detection indicators:**
- Confidence scores with colour coding (High ≥85% green, Medium 50–84% amber, Low <50% red)
- Detection type badges (Personal, Commercial, Legal Privilege, Financial)

### What to click (detailed walkthrough):

1. **Click a highlighted entity** in the document (e.g., "John Smith")
   - Show the detection detail popover with AI explanation
   - "Veil explains *why* it flagged this — 'Personal name detected in context of employment relationship'"

2. **Accept a detection** — click the green checkmark
   - Show the statutory ground selector appearing
   - "When you accept a redaction, Veil requires you to link it to a specific LGOIMA ground. This isn't optional — it's what makes your withholding schedule defensible."
   - Select **s7(2)(a) — Privacy of natural persons**
   - Enter reasoning: "Name identifies a private individual in the context of council correspondence"
   - "For Section 7 grounds, Veil also prompts for the public interest consideration — because s7(1) requires the officer to weigh whether disclosure is outweighed"
   - Click **Apply Ground**

3. **Reject a detection** — click the red X on a low-confidence item
   - "Not every AI detection is correct. Here, Veil flagged 'Bell Block' as a potential personal name, but it's actually a suburb. The reviewer rejects this — and that decision is logged in the audit trail."

4. **Show the detection table** below
   - Point out the **tabs**: All (12), Personal (5), Commercial (3), Other (4)
   - "Officers can filter by detection type and work through systematically"
   - Click different tabs to filter

5. **AI explanation**
   - Click the Brain icon on a detection
   - "Every AI suggestion includes an explanation — what was detected, why, and what ground might apply"

6. **Submit to Senior Review**
   - Point to the "Submit to Senior Review" button
   - "Once the reviewer is satisfied, they submit to the next tier. Veil supports tiered review — Reviewer, Senior Reviewer, Final Approver — matching your existing governance structure."

---

## [12:00–15:00] Withholding Schedule

**Navigate to:** `/requests/req-001/schedule`

### What to say:
> "The withholding schedule is generated automatically from the review decisions. Every redaction links back to its statutory ground, the reviewer's reasoning, and the public interest consideration where applicable."

### What to highlight:
- **Covering statement** — editable text block for the response letter
- **Schedule items table** — each row shows:
  - Page/section reference
  - Description of what was withheld
  - LGOIMA ground (e.g., s7(2)(a), s6(a))
  - Reviewer's reasoning
  - Whether it's been reviewed/approved
- **Right-of-review notice** — standard text informing the requester of their right to complain to the Ombudsman
- **Ground summary** — count of items by ground

### What to say:
> "This schedule can be exported as a PDF to accompany the disclosed documents. If the Ombudsman investigates, every decision is traceable back to the individual detection, the reviewer who made the call, and the reasoning at the time."

### What to click:
- Scroll through the schedule items
- Point to **"Preview as PDF"** button
- Point to **"Mark as Reviewed"** to show the approval workflow

---

## [15:00–17:00] Audit Trail

**Navigate to:** `/requests/req-001/audit`

### What to say:
> "Everything in Veil is auditable. The audit trail is immutable — write-once, read-many. No one can edit or delete entries, not even administrators."

### What to highlight:
- **WORM banner** at top — "Immutable Audit Trail — Write-Once, Read-Many"
- **Timeline entries** — each shows:
  - Timestamp
  - User who performed the action
  - Action type (with colour-coded icons)
  - Details of what changed
- **Change tracking** — where applicable, shows previous → new values
- **Filter and search** — filter by action type, user, date range

### What to say:
> "This trail satisfies the Public Records Act requirements and provides the defensibility the Ombudsman expects. Every AI detection, every human decision, every status change — all recorded with user ID and timestamp."

### What to click:
- Scroll through the audit entries
- Point out the different action types: ingestion, detection, review, approval
- Use the type filter to show only "Review" actions

---

## [17:00–18:30] Export & Release

**Navigate to:** `/requests/req-001/export`

### What to say:
> "When all documents are reviewed and approved, Veil generates the final release package. Redactions are burned into the documents permanently and verified as irreversible."

### What to highlight:
- **Export checklist** — all required steps before release:
  - All documents reviewed ✓
  - Withholding schedule approved ✓
  - Senior review complete ✓
  - Redactions verified as permanent ✓
- **Export options** — PDF package, withholding schedule, audit report, cover letter
- **Verification** — automated check confirming redactions cannot be reversed

### What to say:
> "The export package includes everything NPDC needs: the redacted documents, the withholding schedule, and a full audit report. This is what goes to the requester."

---

## [18:30–20:00] Admin & AI Governance

**Navigate to:** `/admin/ai-governance`

### What to say:
> "Finally, Veil provides full transparency into AI performance. This dashboard shows precision, recall, and accuracy metrics by detection type — so your team always knows how well the AI is performing."

### What to highlight:
- **Accuracy metrics** — Precision 94.2%, Recall 91.8%, F1 Score 93.0%
- **Per-entity breakdown** — accuracy varies by type (names vs. IRD numbers vs. addresses)
- **Model governance** — which model is in use, when it was last updated, data residency confirmation

**Optionally show:** `/admin/rules` for custom rules, `/admin/settings` for system configuration

### Closing statement:
> "Veil is purpose-built for LGOIMA. It's not a generic redaction tool adapted for New Zealand — it understands your statutory grounds, your workflow, and your compliance requirements. Built on Azure NZ North, your data never leaves New Zealand. Every AI suggestion is transparent, every human decision is auditable, and your Ombudsman responses are defensible from day one."

---

## Key Messages to Reinforce Throughout

| Theme | Message |
|-------|---------|
| **LGOIMA-native** | Built specifically for LGOIMA s6, s7, s17 — not adapted from generic redaction |
| **AI + Human** | AI assists, humans decide — every action is accountable |
| **Defensible** | Immutable audit trail, statutory ground linkage, reasoning capture |
| **NZ Data Sovereignty** | Azure NZ North region, data never leaves NZ/AU |
| **Scale** | Handles 1,000–10,000+ documents per request |
| **Workflow** | Tiered review matches council governance structures |

---

## Troubleshooting

- **Sidebar obscuring content:** Click the collapse arrow at the bottom of the sidebar
- **Screen too small:** Demo should be run at 1920×1080 minimum
- **Slow load:** First load after `npm run dev` may take a moment for compilation
- **Navigation:** If you lose your place, the sidebar always shows your current location highlighted
