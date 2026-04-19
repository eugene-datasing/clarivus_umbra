# Viewer Rework — Implementation Plan

**Source request:** Rebuild document viewing architecture for Veil.
**Repo:** `/Users/eugenecash/dev/Agent-teams/veil-product-design/outputs/prototype/veil-prototype/`
**Drafted:** 2026-04-19
**Status:** Draft for review. Read-only exercise; no implementation.

---

## Executive summary

This plan replaces the current split view (HTML reconstruction + optional pdf.js for PDFs only) with a single canonical PDF per document used by reviewer, redactor, approver, and requester alike. Non-PDF formats (DOCX / XLSX / TXT / EML / MSG) gain a persisted canonical PDF derived from LibreOffice conversion (existing) or an HTML-template + LibreOffice path (new, for emails). Azure DI `prebuilt-read` runs against the canonical PDF for every format so detection bboxes live in a single percentage-of-canonical-page coordinate system. pdf.js with an absolutely-positioned overlay layer becomes the primary viewer; QA signoff gains an inline redacted-PDF view and an audit record capturing the SHA-256 of what the approver certified. `Document.contentJson` survives as pipeline-internal AI context only and is removed from every UI render path.

**Total effort:** **29–37 engineer-days** for one engineer working full-time with Claude Code assistance, over ~6–8 calendar weeks. (Revised from 28–35 after adding the DOCX-bbox spike in Phase 2 and a more granular Phase 4 breakdown.)

**Critical path:** Phase 1 (canonical PDF schema + persist) → Phase 2 (Azure DI against canonical + bbox population) → Phase 3 (viewer) → Phase 4 (QA) → Phase 5 (cleanup). Phases 1 and 2 each block everything downstream; Phases 3, 4, 5 can partially overlap after Phase 2 ships.

---

## Phase 1 — canonical PDF persistence and schema

### 1. Scope and success criteria
Persist a single canonical PDF at a deterministic storage key for every processed document, whatever the input format. Success: for every `Document` created after rollout where `fileType` is in the supported set (PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT, RTF, TXT, CSV, HTML, HTM, ODT, ODS, ODP, EML, MSG), a canonical PDF exists at its storage key, `Document.canonicalPdfPath` is populated, and `Document.canonicalPdfSha256` matches the content of that PDF.

**Scanned PDFs** pass through unchanged — canonical = original. OCR continues to be performed by Azure DI `prebuilt-read` at extract time (today's behaviour). No text-layer embedding is attempted in this phase; reviewers see the scanned image in the pdf.js viewer and the DI-extracted words drive detection and overlay positioning as they do now. Text-layer embedding for "copy-select" support is explicitly out of scope and tracked as potential future work.

**Non-English typography (te reo Māori).** LibreOffice conversion (DOCX, XLSX, HTML-from-email) must render macrons correctly (ā, ē, ī, ō, ū). Debian slim's default font set does not guarantee full Latin Unicode coverage under `libreoffice-nogui`. **Mandatory Dockerfile change in this phase:** add `fonts-noto-core` to the runtime apt-get install alongside `libreoffice-nogui`. Without this addition, macrons fall back to the default glyph miss (a visible box), degrading both rendered output and downstream detection overlays that rely on accurate word polygons.

### 2. Schema changes

**Prisma diff — `prisma/schema.prisma:80–131` `Document` model:**

```diff
   originalPath     String?
+  canonicalPdfPath String?   @map("canonical_pdf_path")
+  canonicalPdfSha256 String? @map("canonical_pdf_sha256")
+  canonicalPdfPageCount Int? @map("canonical_pdf_page_count")
+  canonicalPdfBuildMs Int?   @map("canonical_pdf_build_ms")
+  canonicalPdfSource String? @map("canonical_pdf_source") // "original" | "libreoffice" | "email-template"
```

**Generated migration SQL** (`prisma/migrations/20260419_add_canonical_pdf/migration.sql`):

```sql
ALTER TABLE "documents"
  ADD COLUMN "canonical_pdf_path" TEXT,
  ADD COLUMN "canonical_pdf_sha256" TEXT,
  ADD COLUMN "canonical_pdf_page_count" INTEGER,
  ADD COLUMN "canonical_pdf_build_ms" INTEGER,
  ADD COLUMN "canonical_pdf_source" TEXT;

CREATE INDEX "documents_canonical_pdf_sha256_idx" ON "documents"("canonical_pdf_sha256");
```

All new columns nullable so existing rows remain valid. Sha256 index supports later dedup + audit lookup.

**Backfill strategy (see Decision (d)):** lazy per-document. Existing documents keep the current pipeline behaviour. New `/api/documents/[docId]/rebuild-canonical` endpoint lets an admin (or QA step) trigger canonical-PDF generation for a legacy document on demand. A standalone `scripts/backfill-canonical-pdfs.ts` walks the DB in batches of 20 and populates missing rows for admin-triggered bulk runs.

### 3. File-level change list

**New files:**
- `lib/pipeline/canonical-pdf.ts` — orchestrates canonical-PDF build per source type. Exports `buildCanonicalPdf(doc, originalBuffer): Promise<{ pdfBuffer, source, pageCount, sha256, durationMs }>`. ~140 lines.
- `lib/pipeline/email-to-pdf.ts` — converts parsed email (from `lib/pipeline/email-extract.ts`) to HTML transcript, writes temp file, invokes LibreOffice HTML→PDF. ~110 lines.
- `scripts/backfill-canonical-pdfs.ts` — standalone backfill runner. ~70 lines.
- `prisma/migrations/20260419_add_canonical_pdf/migration.sql` — migration.

**Modified files:**
- `prisma/schema.prisma:80–131` — new Document columns (above).
- `lib/pipeline/process.ts:216` (extractText call) — insert `buildCanonicalPdf()` before DI, use its output for OCR in Phase 2.
- `lib/pipeline/process.ts:707–736` (final Document update) — write `canonicalPdfPath`, `canonicalPdfSha256`, etc.
- `lib/pipeline/redact-pdf.ts:77–101` (`buildRedactedPdf`) — if `canonicalPdfPath` is set, use it; otherwise fall back to current behaviour. Deletes the `convertToPdfWithLibreOffice` re-call on every redaction once all rows have canonical PDFs.
- `lib/storage/local.ts` and `azure-blob.ts` — no interface change; caller computes the new `{caseId}/{docId}/canonical.pdf` key.
- `Dockerfile:20–23` — extend the apt-get install list to add `fonts-noto-core` alongside `python3 python3-pip libreoffice-nogui`. Concrete diff:
  ```diff
   RUN apt-get update && apt-get install -y --no-install-recommends \
  -    python3 python3-pip libreoffice-nogui && \
  +    python3 python3-pip libreoffice-nogui fonts-noto-core && \
       pip3 install --break-system-packages PyMuPDF && \
       apt-get clean && rm -rf /var/lib/apt/lists/*
  ```
  `fonts-noto-core` adds ~15 MB to the image, covers Latin / Cyrillic / Greek with full diacritics (all macrons, including ā ē ī ō ū), and is the minimum that guarantees LibreOffice PDF output is faithful to te reo Māori input.

**Deleted or substantially shrunk:** none in Phase 1. Tier 2 on-demand conversion remains as a fallback for legacy rows.

### 4. New or modified API routes
- **New** `POST /api/documents/[docId]/rebuild-canonical` — admin-only (`requireAdmin`). Triggers canonical-PDF rebuild for a single document. Request: empty. Response: `{ status: "built" | "already-built" | "unsupported", canonicalPdfPath, canonicalPdfSha256 }`. Auth: `requireAdmin` + `authorizeForDocument`.
- **Modified** `/api/files/[...path]/route.ts` — no change needed; canonical PDFs are served by the same route using their key.

### 5. Pipeline changes

Current flow in `lib/pipeline/process.ts:62–813`:
```
fetch doc → download → validate → status=processing →
  extractText (Azure DI via extract.ts) → create child docs for attachments →
  format conversion → classify → store pages → dedup → pattern/custom/AI →
  bbox enrich → dedup → store detections → build content → final update
```

New flow — insert `buildCanonicalPdf` immediately after validation, before extractText:
```
fetch doc → download → validate → status=processing →
  buildCanonicalPdf(doc, originalBuffer) → persist canonical PDF to storage →
  extractText (DI now runs on canonical PDF) → … (rest unchanged) →
  final update (adds canonicalPdfPath, sha256, pageCount, source)
```

`buildCanonicalPdf` dispatches:
- `source = "original"` for `.pdf` input — canonical is the original buffer.
- `source = "libreoffice"` for any extension in `LIBREOFFICE_CONVERTIBLE` (`redact-pdf.ts:38–41`) — reuses the existing `libreoffice --headless --convert-to pdf` subprocess.
- `source = "email-template"` for `.eml` / `.msg` — parses via existing `email-extract.ts`, builds HTML transcript, writes to temp `.html`, invokes LibreOffice to convert.
- Otherwise throws; caller marks document `status=error` with a clear message.

**Named branch in `redact-pdf.ts:77–101` — legacy vs canonical.** `buildRedactedPdf` explicitly switches on whether the document has a canonical PDF. This is a named branch, not a side-effect of tier selection:

```ts
// Pseudocode — lib/pipeline/redact-pdf.ts
if (doc.canonicalPdfPath) {
  // CANONICAL PATH — download the persisted canonical PDF, apply Tier 1
  // coordinate redaction directly. Skips the on-demand LibreOffice convert.
  return await redactCanonicalPdf(doc, acceptedDetections);
}
// LEGACY PATH — pre-canonical rows. Run the existing Tier 1 / Tier 2 / Tier 3
// fallback unchanged (original PDF → coord mode → LibreOffice+text-search →
// plain-text PDF). This branch is a deliberate transition fence, kept until
// telemetry reports zero rows with canonicalPdfPath IS NULL.
return await redactLegacy(doc, acceptedDetections);
```

Two independent code paths reduce the blast radius of any Phase 1 regression: new documents use the new path, legacy rows keep today's battle-tested flow. The legacy branch is deleted in a follow-up PR once the backfill sweep clears `canonicalPdfPath IS NULL`. Remove it as its own reviewable commit with a query proving the row count is zero.

### 6. Coordinate system specification
**Unchanged in Phase 1** — bbox population is Phase 2's responsibility. In Phase 1 we only persist the canonical PDF and store its page count / SHA-256. Existing detection rows keep their current (possibly zero) bbox values until Phase 2 backfills them against the canonical PDF.

### 7. Test strategy
**Unit (`vitest`):**
- `lib/pipeline/__tests__/canonical-pdf.test.ts` — stub LibreOffice + email-to-pdf; assert dispatch by extension, error on unsupported format, sha256 calculation.
- `lib/pipeline/__tests__/email-to-pdf.test.ts` — given a sample email, assert the generated HTML contains the expected transcript sections.

**Integration:**
- New integration test that uploads each of `{pdf, docx, eml}` fixtures and asserts a canonical PDF is stored at the expected key. Reuses `test-fixtures/dummy-lgoima-pack/` files.

**E2E:**
- New Playwright spec `e2e/canonical-pdf/build.spec.ts` — uploads a DOCX, waits for processing, hits `/api/files/{canonicalPdfPath}`, expects HTTP 200 and `application/pdf` response.

**Manual:**
- Upload a signed scanned PDF and confirm canonical = original.
- Upload an EML with two attachments and confirm the canonical transcript lists both by filename.

### 8. Rollback plan
- **Schema:** columns are additive + nullable; `ALTER TABLE … DROP COLUMN` safely reverts with no data loss.
- **Code:** revert the commit, redeploy. Existing pipeline still works because canonical PDF is generated but never required.
- **Storage:** orphaned canonical PDF blobs remain; delete via `scripts/cleanup-orphan-canonicals.ts` (trivial to write).

### 9. Effort estimate
**5–6 engineer-days**, assuming LibreOffice HTML→PDF fidelity for the email template is acceptable on first attempt. Adds a day if we hit LibreOffice locale or font issues.

### 10. Dependencies
- **Blocks:** Phase 2 (bbox re-population needs a canonical PDF), Phase 3 (viewer needs a PDF URL), Phase 4 (QA inline viewer), Phase 5 (content-builder cleanup).
- **Blocked by:** nothing in the codebase; Dockerfile already installs `libreoffice-nogui` (line 20–22 of `Dockerfile`).

---

## Phase 2 — Azure DI extraction against canonical PDF; bbox population

### 1. Scope and success criteria
Every Detection row's `posX/posY/posW/posH` is a valid percentage of the canonical PDF's page dimensions. Tier 1 coordinate-mode redaction works for every format, not just native PDF uploads. Success: on a DOCX with repeated names, the reviewer sees tight per-line redaction rectangles on the canonical PDF for every format.

**Pre-implementation spike (~1 engineer-day, blocks the rest of Phase 2).** Before committing to "DI runs on the LibreOffice-converted PDF" for every DOCX, compare that path against an alternative that synthesises word polygons directly from mammoth's rendered HTML layout (skipping LibreOffice + DI for DOCX). Build a minimal prototype of each, run against a 10-document DOCX corpus from `test-fixtures/dummy-lgoima-pack/` × 3 repeats, measure:
- p50 / p95 end-to-end processing time per document
- Detection count delta between the two paths (are we losing or gaining detections by synthesising polygons?)
- Bbox alignment quality on the canonical PDF viewer (manual visual check)

**Decision criterion:** p95 DOCX processing time. If mammoth-synthesised polygons stay within p95 ≤ 8 s and bbox alignment is visually identical, ship the mammoth path for DOCX and reserve DI for PDFs and formats without a native layout source (XLSX, PPTX). If p95 goes over 8 s on either path, or the mammoth path shows detection drift > 5 %, ship the DI-on-canonical path for all formats (simpler, consistent, accepted latency cost). Record the outcome in `docs/phase-2-spike-findings.md` and link from the final PR.

### 2. Schema changes
**None.** Detection shape unchanged. `Document.canonicalPdfPageCount` (added Phase 1) replaces `Document.pageCount` for downstream consumers that care about page count against the canonical PDF — `pageCount` remains the original-file page count for legacy rows.

**Backfill** (optional admin tool): `scripts/repopulate-bboxes.ts` takes a docId, deletes existing Detection rows, reprocesses against canonical PDF. Useful for legacy docs after their canonical PDF is built.

### 3. File-level change list

**Modified files:**
- `lib/pipeline/extract.ts:92–138` (`extractFromPdf`) — no change to signature; now receives canonical-PDF buffer (done by caller).
- `lib/pipeline/process.ts:216` — change the input to `extractText()` from "original download" to "canonical-PDF buffer produced in Phase 1". Single-line change.
- `lib/pipeline/bbox.ts` — no change; `calculateBBoxAll` already uses page dimensions from DI output. For non-PDF inputs its return value is now non-empty (since DI runs on the canonical PDF, which is always a PDF).
- `app/api/documents/[docId]/reprocess/route.ts` — **new**, small (see §4).

### 4. New or modified API routes
- **New** `POST /api/documents/[docId]/reprocess` — admin-only. Clears and re-runs detection pipeline against canonical PDF. Request: `{ reason?: string }` for audit log. Response: `{ status: "reprocessed", detectionCount }`. Auth: `requireAdmin` + `authorizeForDocument`. Creates audit entry `type="document-reprocessed"`.

### 5. Pipeline changes
In `process.ts:216`, the `extractText` call currently downloads `doc.originalPath` for DI. After Phase 1, we already have the canonical PDF buffer in memory from `buildCanonicalPdf()`. Pass that instead of re-downloading. For DOCX/XLSX uploads this is the first time DI produces word polygons — `calculateBBoxAll` (`bbox.ts`) now yields non-empty bboxes for those formats.

### 6. Coordinate system specification
All bboxes are percentages (0–100) of the **canonical PDF page's** width and height, as measured by Azure DI `prebuilt-read` on that PDF. For the overlay layer (Phase 3), translate at render time:
```
x_px = (posX / 100) * pageWidthPx
y_px = (posY / 100) * pageHeightPx
```
where `pageWidthPx` / `pageHeightPx` come from the react-pdf `Page` component's post-render dimensions (reported via its `onRenderSuccess` callback). This means the overlay stays correct at any zoom because percentage bboxes scale linearly.

### 7. Test strategy
**Unit:**
- Extend `lib/pipeline/__tests__/bbox.test.ts` with a fixture DOCX that, after canonical conversion, produces a known word polygon for a target detection. Assert `calculateBBoxAll` returns the expected bbox.

**Integration:**
- Upload a DOCX with three repeats of "Rohan Patel". After processing, DB should have three Detection rows with distinct `posY` values (same invariant B2 validates today, now extended to DOCX).

**E2E:**
- New Playwright spec `e2e/canonical-pdf/bbox-docx.spec.ts` — upload DOCX, verify detections render over the canonical PDF at correct positions (screenshot assertion).

**Manual:**
- Re-run the B2/B3/B5 cross-check script (`scripts/redact-one-document.ts` from the recent remediation) against a DOCX. Expect same 67/67 match rate as we got for PDFs.

**Performance regression:**
- New `scripts/bench-processing.ts` benchmark runner. Processes a standard corpus of fixtures (2 PDFs, 2 DOCX, 1 XLSX, 1 EML, drawn from `test-fixtures/dummy-lgoima-pack/`) ten times each, records per-document wall time, emits JSON with p50 / p95 / p99 by format.
- Baseline: run against `main` immediately pre-merge, commit the JSON as `docs/bench-baselines/phase-2-main.json`.
- Assertion in CI: post-merge bench must keep p95 per format within **baseline + 30 %**. Over-ceiling runs fail the PR until the cause is identified or the ceiling is explicitly raised (requires reviewer note in the PR description).
- Budget for occasional re-baselining when Azure DI or LibreOffice versions shift: re-run the baseline quarterly or whenever the Dockerfile touches `libreoffice-*` or the DI SDK version bumps.

### 8. Rollback plan
Revert the single line in `process.ts:216`. Existing non-PDF documents will revert to (0,0,0,0) bboxes and the Tier 2 text-search fallback (unchanged from today).

### 9. Effort estimate
**5–6 engineer-days** = 1 day for the DOCX-bbox spike (§1) + 4–5 days for implementation, test coverage, and benchmark wiring. Most of the implementation time is in edge cases: scanned PDFs, password-protected documents, very wide spreadsheets that span dozens of landscape pages post-conversion, and the benchmark baseline setup.

### 10. Dependencies
- **Blocks:** Phase 3 (viewer needs reliable bboxes), Phase 4 (QA), Phase 5.
- **Blocked by:** Phase 1.

---

## Phase 3 — viewer rework (pdf.js primary, HTML removed from UI path)

### 1. Scope and success criteria
`app/requests/[id]/review/[docId]/` renders the canonical PDF via react-pdf with an absolutely-positioned detection overlay. The HTML reconstruction path is removed from the review UI (but kept in `contentJson` for pipeline use — Phase 5 cleans that up). Reviewers can accept/reject detections by clicking the overlay highlights. Keyboard navigation (A/R shortcuts, arrow keys) continues to work. Success: reviewer workflow is visually faithful to the original document and every detection is click-targeted.

### 2. Schema changes
**None.** The feature flag lives as a row in the existing `SystemSetting` key/value table at `prisma/schema.prisma:222–230` — no new columns required.

```
model SystemSetting {
  id        String   @id @default(cuid())
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt
  updatedBy String   @default("system")
  @@map("system_settings")
}
```

Row shape for the viewer flag: `key = "VIEWER_MODE"`, `value = { mode: "html" | "pdf" }`. The same pattern applies to `QA_REQUIRE_PDF_INSPECT` in Phase 4: `key = "QA_REQUIRE_PDF_INSPECT"`, `value = { enabled: boolean }`. Read via the existing `getSetting()` / `setSetting()` helpers in `lib/data/settings.ts`. Write via admin-only settings UI (out of scope here; admins can set directly via `npx prisma studio` if needed before the UI ships).

### 3. File-level change list

**Modified files:**
- `app/requests/[id]/review/[docId]/page.tsx` — drop `getDocumentContent(docId)` call (no longer needed for rendering); pass `canonicalPdfPath` to client.
- `app/requests/[id]/review/[docId]/review-client.tsx` — major rewrite: remove `DocParagraph`-rendering subtree; primary layout is now `<PdfViewerWithOverlay />` + existing detection sidebar. ~200 lines removed, ~150 added.
- `components/review/pdf-viewer.tsx` — extend to emit rendered page dimensions via a new prop `onPageDimensions: (page, width, height) => void`.
- `components/review/detection-overlay.tsx` — **new**, renders absolutely-positioned `<button>` elements per detection, keyed to `selectedDetectionId`, accepts keyboard events.

**Deleted or substantially shrunk:** `components/review/paragraph-renderer.tsx` (or wherever the DocParagraph JSX lives) — removed from the review screen. Kept in the codebase if another screen still uses it; otherwise deleted.

### 4. API routes
**None new.** The `/api/files/[...path]/` route already serves the canonical PDF (Phase 1) and is used by the PDF viewer via `pdfUrl`.

### 5. Pipeline changes
**None.** The pipeline still builds `contentJson` for AI detection; only the UI stops consuming it.

### 6. Coordinate system specification
See Phase 2 §6. In the overlay component:

```tsx
// Pseudocode
<div className="pdf-page-container" style={{ position: "relative" }}>
  <Page pageNumber={n} onRenderSuccess={({ width, height }) => setDims(width, height)} />
  {detectionsOnPage.map(det => (
    <button
      className="detection-overlay-btn"
      style={{
        position: "absolute",
        left: `${det.posX}%`,
        top: `${det.posY}%`,
        width: `${det.posW}%`,
        height: `${det.posH}%`,
      }}
      onClick={() => onSelect(det.id)}
    />
  ))}
</div>
```

Percentages against the rendered page element let the overlay track zoom automatically — no pixel-level recomputation needed.

### 7. Test strategy
**Unit:**
- `components/review/__tests__/detection-overlay.test.tsx` — given detections and a fake page size, assert positioning attributes are within tolerance.
- `components/review/__tests__/pdf-viewer.test.tsx` — onPageDimensions callback fires after render.

**E2E:**
- New Playwright spec `e2e/review/pdf-viewer.spec.ts` — upload doc, open review screen, click a detection in the sidebar, assert the overlay rectangle in the PDF has focus. Second test: click the overlay rectangle, assert the sidebar entry becomes selected.
- Update existing `e2e/review/*.spec.ts` specs that currently assert HTML paragraph content — replace with PDF-viewer assertions.

**Manual:**
- Keyboard navigation pass: A/R accept/reject, arrow keys between detections, Escape dismiss.
- Accessibility: screen-reader announce detection under cursor, focus ring visible, tab order sane.
- Zoom test: 50%, 100%, 200% — overlays must stay aligned.

### 8. Rollback plan
**Feature flag** (Decision (f)): add `SystemSetting` key `VIEWER_MODE` with values `"html"` | `"pdf"`. Review page reads the flag and renders either the old paragraph path or the new PDF path. Roll out `"pdf"` to PNCC first, watch for issues, flip remaining tenants. Revert by flipping the flag, no redeploy needed.

### 9. Effort estimate
**8–10 engineer-days.** The overlay layer is straightforward but gets fiddly around zoom, scroll sync with the sidebar, keyboard nav, and a11y. Existing Playwright coverage of the review flow is extensive (297 tests) and many will need updating.

### 10. Dependencies
- **Blocks:** Phase 4 (reuses the viewer), Phase 5 (contentJson removal is safe only after no UI consumes it).
- **Blocked by:** Phase 2 (bboxes must be correct against canonical PDF).

---

## Phase 4 — QA signoff hardening

### 1. Scope and success criteria
The QA approval screen (`app/requests/[id]/qa/`) renders the **redacted output PDF** inline before the approver clicks "certify". On certification, an audit entry is written that captures the SHA-256 of the exact PDF the approver viewed. Success: a later Ombudsman challenge can definitively prove which redacted PDF bytes the approver saw.

### 2. Schema changes

**Migration:** extend `AuditEntry` to store structured metadata for "what was viewed" entries. Either:

```diff
   detail        String?
+  metadata      Json?   @map("metadata")
```

Raw SQL:
```sql
ALTER TABLE "audit_entries" ADD COLUMN "metadata" JSONB;
```

`metadata` for a `"sign-off"` entry will contain `{ redactedPdfSha256, redactedPdfPageCount, viewedAt, viewMode: "pdf" }`. Existing `detail` remains as a human-readable string; `metadata` is the machine-readable sibling. Nullable, backward-compatible.

**Integrity hash** (`lib/data/audit.ts:39–59`): extend `computeIntegrityHash()` to include `JSON.stringify(metadata ?? null)` in the hash input. This is a breaking change for the integrity chain — existing chains verified with the old hash function will remain valid for old entries but new entries are hashed with the new function. `verifyAuditIntegrity()` must switch hash functions based on whether the entry has non-null metadata, or alternatively a `hash_version` column is introduced (recommended — see Risks).

### 3. File-level change list

**New files:**
- `app/requests/[id]/qa/redacted-preview.tsx` — renders the redacted PDF via the Phase 3 viewer, computes its SHA-256 on the client, passes to the "certify" action.
- `lib/actions/qa-actions.ts` — **new** or **extended**; adds `certifyWithSha256(caseId, docId, sha256)` server action.

**Modified files:**
- `app/requests/[id]/qa/qa-client.tsx:122–142` — expand the checklist card for each document to include an "inspect redacted output" button that opens `<RedactedPreview>` in a modal or drawer.
- `lib/data/audit.ts:39–59` (`computeIntegrityHash`) — accept optional metadata, include in hash.
- `prisma/schema.prisma:185–208` — `AuditEntry` gets `metadata Json?`, `hash_version Int @default(1)`.

### 4. API routes
- **New** `GET /api/documents/[docId]/redacted-preview` — streams the redacted PDF built on-the-fly via `buildRedactedPdf()` (already exists in `lib/pipeline/redact-pdf.ts:51`). Returns `application/pdf` with header `X-Content-Sha256`. Auth: `requireUser` + `authorizeForDocument` + role ∈ `{ senior-reviewer, final-approver, admin }`.
- **New** `POST /api/qa/certify` — body `{ caseId, docId, sha256 }`. Server recomputes the PDF + SHA-256, compares to the client's supplied value, rejects if mismatched, writes audit entry with metadata `{ redactedPdfSha256, redactedPdfPageCount, viewedAt, viewMode: "pdf" }`. Auth: `requireUser` + `authorizeForCase` + role check.

### 5. Pipeline changes
**None.** Redaction pipeline unchanged; QA flow now calls the existing `buildRedactedPdf()` to produce the preview.

### 6. Coordinate system specification
N/A — this phase is about display + audit of the already-redacted output.

### 7. Test strategy
**Unit:**
- `lib/data/__tests__/audit.test.ts` — extend existing tests to cover metadata field, hash-version branch in `verifyAuditIntegrity`.

**Integration:**
- New test: build redacted PDF for a fixture case, certify with an incorrect SHA, expect 409. Certify with correct SHA, expect 201 and audit entry written.

**E2E:**
- New Playwright spec `e2e/qa/certify-with-preview.spec.ts` — approver opens QA page, clicks "inspect", PDF loads inline, clicks "certify", assert audit-trail screen shows the signoff entry with a readable SHA-256.

**Manual:**
- Tamper with the redacted PDF bytes between inspect and certify (simulate by regenerating pipeline between clicks). Expect the certify step to reject.

### 8. Rollback plan
- **Flag:** `QA_REQUIRE_PDF_INSPECT` SystemSetting defaults false. When false, old certify flow applies (no PDF preview, no SHA check, no metadata).
- **Schema:** `metadata` column is nullable; revert by removing the reading code path.
- **Integrity chain:** the `hash_version` column ensures old entries verify against old hash function even after revert.

### 9. Effort estimate
**8–10 engineer-days.** Revised upward from the earlier 5–6 after working through the sub-tasks — the hash-version migration and verifier changes are heavier than a single schema bullet implies.

Breakdown:

- **Integrity hash versioning** — add `hash_version Int @default(1)` column, extend `computeIntegrityHash()` to accept `metadata`, write new entries with `hash_version = 2`: **1.5 days**.
- **`verifyAuditIntegrity()` dual-version verifier** — dispatch on `hash_version` so old entries verify under v1 and new entries under v2; golden test fixtures for both versions: **1 day**.
- **Client-side SHA-256 hashing of the rendered PDF + server-side recompute + 409 on mismatch** — browser WebCrypto `subtle.digest`, server-side matching, client flow in `redacted-preview.tsx`: **1 day**.
- **Inline `<RedactedPreview>` component** — reuses Phase 3 viewer inside a modal/drawer, loading spinner while `buildRedactedPdf()` runs, certify button wired to the new server action: **1.5 days**.
- **New API routes** — `GET /api/documents/[docId]/redacted-preview` (streams PDF with `X-Content-Sha256` header) and `POST /api/qa/certify` (verifies SHA, writes audit entry): **1.5 days**.
- **Tests** — unit tests for audit dual-version chains (`lib/data/__tests__/audit.test.ts`), integration test for SHA-mismatch 409, E2E Playwright spec for inspect-then-certify flow, manual tamper-between-clicks verification: **2 days**.
- **Contingency** — integrity-chain edge cases (first entry in a case, legacy entries with null integrityHash already in prod) and rollback-flag wiring of `QA_REQUIRE_PDF_INSPECT`: **0.5–1.5 days**.

Sum: **9–10 days nominal, 8 days if contingency is small.**

### 10. Dependencies
- **Blocks:** Phase 5 (cleanup).
- **Blocked by:** Phase 3 (reuses the viewer component for the preview).

---

## Phase 5 — content-builder cleanup (contentJson becomes AI-only)

### 1. Scope and success criteria
`Document.contentJson` is no longer rendered to any user-facing component. It lives only to feed the AI detection pipeline (`lib/pipeline/ai-detect.ts`) and can be trimmed to the minimum shape that pipeline needs. No regressions in AI detection precision/recall.

### 2. Schema changes
**Optional migration** (defer to a later cleanup pass): drop `Document.contentJson` if AI pipeline can be refactored to consume the canonical PDF's DI output directly. Complex — out of scope for Phase 5. Instead:
- `Document.contentJson` becomes **internal-only**. Add a comment in `schema.prisma` and remove it from any API response type.

No migration required.

### 3. File-level change list

**Modified files:**
- `lib/pipeline/content-builder.ts:167–228` — trim `buildContent` / `buildContentFromBlocks` to output only what AI detection consumes (no styling attempts, no tables-as-text, just paragraph-per-page text runs). Net reduction ~100 lines.
- `lib/data/documents.ts` (or wherever `getDocumentContent` lives) — remove from server-component imports once Phase 3 is live. Keep for tests of the AI pipeline.
- `app/requests/[id]/review/[docId]/page.tsx` — confirm `getDocumentContent` is no longer imported.

**Deleted:**
- `components/review/paragraph-renderer.tsx` (if not already deleted in Phase 3).
- Any `DocParagraph`, `DocTableRow`, `DocTableCell` rendering utilities no longer referenced. Grep to confirm before deletion.

### 4. API routes
**None.** No route change; `getDocumentContent` was a server function, not an HTTP route.

### 5. Pipeline changes
Trim `buildContent` to minimum AI-feeding shape. Nothing removed from the pipeline flow itself.

### 6. Coordinate system
N/A.

### 7. Test strategy
**Unit:**
- Run existing AI-detection golden tests (if any) — precision/recall must not drop. If no golden tests exist, add one on a known fixture doc with expected detection counts, pre/post cleanup.

**Integration:**
- Reprocess a couple of cases against the trimmed content-builder and diff detection output. Expected: byte-identical or within a tolerance (AI non-determinism).

**E2E:**
- No new specs. Existing Phase 3 review specs must continue to pass, proving the UI doesn't accidentally depend on `contentJson`.

**Manual:**
- Spot-check AI detection quality on one EML, one DOCX, one PDF. Confirm detection count stable.

### 8. Rollback plan
Revert the commit. The trimmed content-builder falls back to its previous form. No schema change to undo.

### 9. Effort estimate
**3–5 engineer-days.** Heavy on verification (AI precision/recall), light on code.

### 10. Dependencies
- **Blocks:** nothing. Final cleanup.
- **Blocked by:** Phase 3 (UI must stop consuming contentJson first).

---

## Decisions with recommendations

### (a) Azure DI tier for non-PDF canonical PDFs — `prebuilt-read` vs `prebuilt-layout`
**Recommend: `prebuilt-read` for all formats.** Current pipeline already uses it (`lib/pipeline/extract.ts:96`), bboxes only need word polygons + page dimensions, and prebuilt-layout costs roughly 2× per page without benefit for redaction. If we later need table structure for reports, that's a new use case, not this one.

### (b) Email-to-PDF rendering library
**Recommend: LibreOffice HTML→PDF** (reuses the existing `libreoffice --headless --convert-to pdf` subprocess that already handles `.html` per `redact-pdf.ts:38–41`). Zero new dependencies, same Dockerfile install, consistent fidelity with DOCX conversion. Alternative `pdf-lib` with manual layout is feasible (pdf-lib is installed) but requires hand-rolling address blocks, header/body typography, attachments list — weeks of polish for dubious gain. Puppeteer / Playwright add ~300 MB to the image and require Chromium's sandbox story to be sorted out, which is a security review of its own.

**This choice is specifically aligned with Decision (g) — simple transcript.** LibreOffice's HTML-to-PDF fidelity is adequate for a clean `{From, To, Cc, Subject, Date}` header block plus plain-text body plus attachments list, but degrades rapidly for complex HTML email (inline CSS, nested tables, remote images). If we revisit (g) in future and decide to preserve richer HTML email fidelity, this decision must be re-opened — LibreOffice is not the right tool for that job, and a headless-browser path (Puppeteer/Playwright) becomes the only realistic option.

### (c) Storage path structure for canonical PDFs
**Recommend: co-locate with original.** Keys: `{caseId}/{docId}/original{ext}` (existing) and `{caseId}/{docId}/canonical.pdf` (new). Same container, same auth path, the existing `/api/files/[...path]/route.ts:40–94` serves both transparently. Separate prefix would force a second auth pathway and increase the surface area of the storage abstraction.

### (d) Backfill strategy for existing Documents
**Recommend: lazy, admin-triggered.** Downtime risk from bulk backfill is unacceptable for the live PNCC demo environment, and the existing Tier 2 code path (on-demand LibreOffice) is proven to work for legacy documents. Provide `POST /api/documents/[docId]/rebuild-canonical` and `scripts/backfill-canonical-pdfs.ts` for admin-initiated migration, but do not block rollout on migrating legacy data. Accept the transitional inconsistency: new documents get the new viewer, legacy documents keep the old path until reprocessed. Combined with the feature flag (Decision f), this lets us roll out per-tenant without a big-bang migration.

### (e) Detection overlay rendering technique
**Recommend: absolutely-positioned `<button>` elements over the pdf.js canvas.** Keyboard focus, ARIA labels, click events all work natively. Percentage-based positioning automatically scales with the PDF's rendered size (zoom-aware without recomputation). SVG overlay is a close second and gives crisp edges at extreme zoom, but loses the accessibility boilerplate. pdf.js's annotation-layer API is internal to pdfjs, not exposed cleanly by `react-pdf`, and couples us to its version-specific rendering — upgrading pdfjs would risk breaking the overlay.

### (f) Feature flag or direct rollout
**Recommend: feature flag via `SystemSetting` for the Phase 3 UI switch** (`VIEWER_MODE="html"|"pdf"`), and **direct rollout for Phases 1, 2, 4, 5**. Schema changes from Phase 1 are backward-compatible and don't need a flag. Phase 3 is the disruptive UI change and benefits from staged rollout (PNCC opts in, other tenants keep the HTML view until ready). Phase 4's QA hardening can go behind `QA_REQUIRE_PDF_INSPECT`. Phase 5 has no user-visible impact and doesn't need a flag.

### (g) Rich email fidelity
**Recommend: simple transcript, plain-text body.** Render emails as `{From, To, Cc, Subject, Date}` block + plain-text body (via `simpleParser`'s `text` field or `htmlToText` of the HTML body) + attachments listed by filename. Preserving inline HTML styling invites three problems: (i) inline images can obscure PII from text-search redaction; (ii) CSS tricks (background images, display:none text) can hide content from detection; (iii) LibreOffice's HTML→PDF fidelity for complex email HTML is mediocre. A clean transcript is auditable, predictable, and gives the AI detection pipeline unambiguous text to scan. If specific customers later want HTML fidelity, that's a second-tier option behind a per-case setting.

---

## Risks

### Governance
- **Reprocessing destroys reviewer decisions.** Re-running detection against a canonical PDF generates fresh `Detection` rows with new cuid IDs, invalidating any audit reference to the old detection IDs (accept/reject records, applied grounds, reviewer explanations, per-detection review entries). Left unguarded this is an integrity attack surface: an admin could silently reprocess a case after signoff and erase the evidence of prior reviewer decisions without any visible trace.

  **Policy:** `POST /api/documents/[docId]/reprocess` (introduced in Phase 2) MUST query the document's audit trail first and reject the request with 409 if any `audit_entries` row exists for that document with `type IN ("review", "accept-detection", "reject-detection", "sign-off", "senior-review-submitted", "final-approval")`. The only way to proceed is to set `{ override: true, justification: string }` in the request body — a non-empty justification is required, and the handler MUST write the compensating audit entry described below **before** starting the reprocess. The override path requires `admin` role (not `request-manager`).

  **Compensating audit entry shape** (single entry per override):
  - `type`: `"reprocess-override"`
  - `description`: `"Reprocess overridden despite existing reviewer decisions"`
  - `target`: the document id
  - `caseId`: the parent case
  - `userId` / `userName` / `userRole`: the admin who triggered
  - `detail`: the justification string, first passed through the existing `stripPiiPatterns()` sanitiser
  - `metadata` (JSONB column introduced in Phase 4): `{ priorDetectionCount, priorReviewedCount, priorAcceptedCount, priorSignedOffAt, priorSignedOffBy, overrideReason }`
  - `hash_version`: `2` (uses the new hash function that includes metadata)
  - Integrity hash chained from the previous case entry as usual; the override entry is permanent and cannot be retrospectively hidden.

  **Detection-ID preservation (optional future work):** if preserving detection IDs across reprocess becomes a requirement (e.g. to keep audit references resolvable by ID), a second-pass matcher aligning new detections with old ones by `(page, type, text, posY ± 1 %)` would be needed. Out of scope here but flagged for a follow-up design review if the "block-by-default plus admin override" policy proves too blunt in practice.

### Architectural
- **Integrity chain migration (Phase 4).** Extending `computeIntegrityHash()` to include `metadata` breaks hash continuity unless we introduce a `hash_version` column. Without it, an Ombudsman-style verification sweep would fail on entries straddling the upgrade. The plan includes `hash_version` — do not skip it.
- **Two pipelines coexisting.** Between Phase 1 rollout and backfill completion, half the document population will have canonical PDFs and half won't. `redact-pdf.ts` must cleanly handle both paths, and the feature flag in Phase 3 must gate correctly per document. Test `canonicalPdfPath == null` as an explicit branch, not a side-effect.

### Dependency
- **LibreOffice font / locale for emails — mitigated in Phase 1 scope.** The Dockerfile change mandated in Phase 1 §1 (install `fonts-noto-core` alongside `libreoffice-nogui`) resolves the macron rendering concern for te reo Māori content and any other non-ASCII Latin text. This item is retained here for awareness of the risk class but no further action is required beyond Phase 1 rollout.
- **react-pdf 10.4.1 + React 19 compat.** The current version was chosen before the React 19 migration in this codebase. Overlay rendering at scroll/zoom may expose concurrent-rendering edge cases; budget a day for react-pdf version investigation in Phase 3.
- **Azure DI throughput.** DOCX uploads convert to PDF first (LibreOffice), then DI runs on the PDF. Combined latency is higher than today's DOCX path. Large XLSX files (hundreds of cells) can produce 50+ landscape PDF pages post-conversion; each page is a DI-billed unit. Monitor cost and re-evaluate prebuilt-read vs text-only extraction if it spikes.

### Migration / operational
- **Storage costs.** Every non-PDF document now has two blobs (original + canonical.pdf). For 10,000 DOCX inputs, that's roughly 2× the storage footprint on the Azure Blob side. Quantify before rollout; consider lifecycle policy (retain canonical indefinitely, demote original to cool tier after N days).
- **Backfill script contention.** `scripts/backfill-canonical-pdfs.ts` running against production needs rate limiting to avoid exhausting DI quota or LibreOffice CPU. Include a `--max-concurrent 2` flag from day one.
- **Feature-flag leakage.** If a tenant has `VIEWER_MODE=pdf` but their documents haven't been backfilled, the reviewer sees "No canonical PDF available — reprocess this document" rather than a broken page. Spec that error state explicitly in Phase 3.

---

## Implementation log — Phase 1

- Email transcript Date field currently renders in ISO 8601 (2026-04-14T09:00:00.000Z). For production polish, reformat to NZ government style (14 April 2026, 9:00 am UTC). Deferred — not a Phase 1 blocker. Revisit during Phase 3 viewer polish or as a standalone follow-up.
- Developer ergonomics: LibreOffice binary name differs across platforms (`libreoffice` on Debian/Ubuntu, `soffice` on macOS homebrew). Local dev currently requires a symlink (`ln -sf /opt/homebrew/bin/soffice /opt/homebrew/bin/libreoffice`). Follow-up: implement `LIBREOFFICE_BIN` env var with fallback resolution order (libreoffice -> soffice). Not a prod issue — container always has libreoffice. Deferred beyond Phase 1 scope.

---

## Open questions for reviewer

1. **Acceptable processing-time regression.** DOCX uploads today skip DI (content extracted by mammoth). Phase 2 adds LibreOffice conversion + DI on top. Expect DOCX processing latency to roughly double (5s → 10–12s for typical files) on the DI-on-canonical path. The Phase 2 §1 spike will measure this against a mammoth-synthesised-polygons alternative; the decision criterion is p95 ≤ 8 s. Is that 8 s ceiling correct, or do you want a different threshold?

2. **Downtime budget for Phase 1 deploy.** Prisma migrations on Azure Postgres Flexible Server take a few seconds for the `ALTER TABLE … ADD COLUMN`, but any concurrent upload during the window could fail. Is a short maintenance window acceptable, or must we coordinate with a blue/green deploy?

3. **pdf.js upgrade appetite.** If Phase 3 exposes `react-pdf@10.4.1` + React 19 bugs that are fixed in react-pdf v11+, is it OK to bump within the scope of this work, or do we treat it as a separate tracked upgrade?

4. **Per-user view preference.** Should reviewers be able to switch back to an HTML view during the transition (for accessibility reasons), or is the PDF view mandatory once the feature flag is on for their tenant?
