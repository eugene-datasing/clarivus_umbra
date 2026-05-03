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

### Option A: Azure (production)

Production URL: https://app-umbra-prototype.azurewebsites.net (Phase 11b).
Sign in via Microsoft Entra SSO with a tenant-allowed account; first
sign-in for a fresh seed prompts for the activation code.

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
- Click "Upload" on the open batch. Drop in your prepared PDFs / DOCX
  / EML / MSG files (the pipeline handles all of these).
- Show the upload progress / queue indicator.
- The pipeline runs: file extraction → OCR (Azure DI for scanned PDFs)
  → regex patterns (NZ PII formats) → label-adjacent (table fields)
  → AI detection (GPT-4o, PII-only prompt — Phase 12.1) → custom
  rules → entity-propagation → bbox calculation → **tier-routing**
  (Phase 12.2: high-confidence auto-accepted at write time, medium →
  Tray, low → suppressed) → pageContext capture (Phase 12.4: ±100
  chars around each match) → storage.
- Pause on the **Auto-redact** behaviour: clean PII like passport
  numbers, IRD numbers, phone numbers, and high-confidence names land
  as `accepted` immediately — no reviewer touch needed.

### 4. Tray review (4 min)

**The Tray (`/batches/[id]/bulk-review`) is the canonical review
surface in v2.** Per-document review still exists as a drill-in; it
is no longer the default.

- Open the Tray.
- Each row is a **cluster** — a group of detections with the same
  type + text, e.g. "Sarah Mitchell (personal-name) — 8 occurrences in
  3 docs · avg confidence 78%".
- Expand a cluster: pageContext snippets (±100 chars) for each
  occurrence. The matched text is bolded; surrounding context lets
  the reviewer see "Sarah Mitchell from Finance" vs "Sarah Mitchell
  the complainant" before approving.
- Demonstrate **Approve cluster** — flips all 8 detections to
  `accepted` with one click.
- Demonstrate **Reject cluster** — same mechanism, the inverse status.
- Demonstrate **Drill in** — opens the per-doc review for fine-grained
  override.
- Filter by type, sort by occurrences. Empty-state: when the Tray
  clears, the batch transitions to `auto-redacted` (or `reviewed` if
  any docs were drilled-in and signed off).

### 5. Export (2 min)

- Navigate to /batches/{id}/export.
- **Auto-export banner** at the top — when the batch reached
  `auto-redacted`, an auto-export pg-boss job already kicked off.
  States: queued → generating → verifying → complete (Download
  button) / failed (Retry auto-export).
- Manual Generate Export remains as the fallback and the path for
  reviewed (not auto-redacted) batches.
- Click Download. Open the ZIP and walk through the contents:
  - `redacted/{name}.pdf` per document
  - `redaction-schedule.pdf` — grouped by detection type
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
- Two roles. No workflow. **Auto-redact-by-default** with cluster
  review for the ambiguous cases. One ZIP per batch.
- 12 detection types, all PII-focused. No statutory grounds.
- Live on Azure Australia East at
  https://app-umbra-prototype.azurewebsites.net.
- Audit chain re-verifies on download. The data model + retention
  worker + tier-routing pipeline + Tray UI are all post-Phase-12.5
  production state.

---

## Frequently asked questions

**Q: Do I have to manually accept every detection?**
A: No — Phase 12.2 auto-accepts every high-confidence detection at
write time. The Tray surfaces only ambiguous cases (medium-confidence)
and the reviewer approves whole clusters across documents. Most
batches need no per-detection review at all.

**Q: What about LGOIMA grounds / public-interest tests?**
A: Out of Umbra's scope (and removed entirely in Phase 12.1). Umbra
produces redacted documents; the disclosure workflow (assign,
deliberate, write to requester) lives elsewhere. The Veil predecessor
handled the full workflow; if that's the requirement, see
`DataSing/clarivus_veil`.

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
