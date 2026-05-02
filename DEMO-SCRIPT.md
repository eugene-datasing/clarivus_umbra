# Umbra — Demo Script

A 15-minute walkthrough of the Umbra PII redaction tool. The script is
written for a fresh Ministry of Demo seed; substitute real council /
agency content as appropriate.

> **Sample documents in `public/sample-documents/`** — the Veil-era
> demo fixtures are still on disk but no longer referenced from
> source. **TODO (Phase 10)**: replace with neutral Umbra demo PDFs or
> drop the directory entirely. Until then, prepare your own demo
> documents (any PDF / DOCX / EML / MSG / TXT with realistic PII).

---

## Pre-demo setup

### Option A: Azure (when Phase 11 lands)
Phase 11 will publish the canonical `umbra.<domain>.nz`. Until then, demo
locally.

### Option B: Local development

1. `docker compose up -d`
2. `npm run dev` from the project root
3. Open http://localhost:3000 in Edge or Chrome (full-screen, no bookmarks bar)
4. Sign in with the demo credentials shown on the login page
   (credentials login is enabled in development)
5. If this is the first time running locally, you'll be prompted for an
   activation code. Enter any valid code — this is a one-time step.
6. Ensure the sidebar is expanded
7. Have one or two test documents ready (PDF or DOCX with realistic PII)

**Pre-demo data reset (local):**
```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes go ahead" \
  DATABASE_URL="postgresql://umbra:umbra_dev@localhost:5434/umbra" \
  npx prisma migrate reset --force
```

The seed produces:
- 1 admin (Eugene Cash, eugene@datasing.nz)
- 3 reviewer users with NZ-flavoured names
- Organisation: **Ministry of Demo**
- 3 sample Batches: Q1 Public Submissions, May 2026 Consultation Responses,
  Working Group Correspondence (no documents — upload real files during
  the demo)

---

## Script (15 minutes)

### 1. Landing + sign-in (1 min)
- Open the landing page. Point out: simple, single-tenant tool, no
  workflow ceremony.
- Sign in. Note the two-role world: admin (you) and reviewer (the rest
  of the seed users). No departments, no SCIM.

### 2. Batches list (2 min)
- Navigate to /batches.
- Three sample batches visible. Each has a `BATCH-2026-NNN` reference
  auto-assigned at creation.
- Open any batch. Empty document list — admin uploads real files
  during demos.
- Show the Delete button (admin only) — soft-deletes to Trash.

### 3. Upload + processing (3 min)
- Click "Upload" on the open batch. Drop in your prepared PDF.
- Show the upload progress / queue indicator.
- The pipeline runs: file extraction → OCR (if scanned) → document
  classification → regex patterns → AI detection → custom rules →
  bbox calculation → storage.
- Once processing completes, click into the document.

### 4. Review (4 min)
- Show the dual-pane review view: PDF on the left, detection list
  with sidebar on the right.
- Walk through accept / reject for a few detections of different
  types: a personal name, a phone number, a free-frank governance
  finding.
- Open the bulk review panel. Show "accept all of type X" and
  "accept all matching this text".
- Demonstrate adding a manual detection: drag-select text on the PDF
  → confirm → it joins the detection list.
- Sign off the document (admin only).

### 5. Export (2 min)
- Navigate to /batches/{id}/export.
- Show the readiness summary: signed-off / not-signed-off / blocked
  counts per document.
- Click Generate Export Package. Show the progress bar; the engine
  redacts each document, builds the schedule + audit timeline + audit
  log, assembles the ZIP, computes SHA-256.
- When complete, download. Open the ZIP and walk through the
  contents:
  - `redacted/{name}.pdf` per document
  - `redaction-schedule.pdf` — grouped by detection type, **never
    contains the redacted values themselves** (Amendment A4)
  - `audit-timeline.pdf` — per-document handling timeline
  - `audit-log.pdf` + `audit-log.csv` — full immutable trail
  - `manifest.json` + `verification-report.txt`

### 6. Retention + audit archive (2 min)
- Back to /batches. Soft-delete the batch we just exported.
- Navigate to /admin/retention. Show the Trash table with the deleted
  batch. Restore is one click; Purge Now requires a reason if the
  grace window is skipped.
- Show the Purge History panel (empty unless a previous purge already
  ran).
- From /admin/settings → Backup tab, show the Retention & Audit
  Archive panel. Click Download Audit Archive (ZIP). Open the
  resulting ZIP — every archive directory under `archives/{YYYY}/...`
  with a top-level `verification-summary.json` showing chain validity
  and SHA-256 match for each archive.

### 7. Closing notes (1 min)
- Two roles. No workflow. One ZIP per batch. Audit chain that
  re-verifies on download.
- Phase 11 will publish to Azure NZ North. The data model + retention
  worker + redaction engine are all stable post-Phase 7.

---

## Frequently asked questions

**Q: Do I have to manually accept every detection?**
A: No — bulk review accepts all detections of a given type, or all
matching a given text. Auto-accept of high-confidence detections is on
the roadmap.

**Q: What about LGOIMA grounds / public-interest tests?**
A: Out of Umbra's scope. Umbra produces redacted documents; the
disclosure workflow (assign, deliberate, write to requester) lives
elsewhere. The Veil predecessor handled the full workflow; if that's
the requirement, see `DataSing/clarivus_veil`.

**Q: How do I get the audit log out for an external auditor?**
A: Export ZIP includes `audit-log.csv` and `audit-log.pdf` for the
single batch. Cross-batch download from /admin/settings (Backup tab)
gives you every archived chain in one ZIP, re-verified at download
time.

**Q: What happens to a deleted batch?**
A: Soft-delete moves it to Trash with a 7-day grace window. The
hourly retention worker archives the audit chain to blob storage,
roundtrip-verifies, then cascade-deletes the batch + its blobs. A
`PurgeLog` row records the archive path and chain verdict — that row
survives the cascade.

**Q: Can I redact a scanned PDF?**
A: Yes — Azure Document Intelligence's `prebuilt-read` OCR runs first.
Some handwritten content is still a known gap (see
`docs/scanned-handwritten-handling-gap-2026-04.md`).
