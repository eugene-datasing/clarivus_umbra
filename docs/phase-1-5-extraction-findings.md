# Phase 1.5 — Extraction-quirk investigation findings

**Date:** 2026-04-20
**Context:** Phase 1.5 of `docs/detection-coverage-plan-2026-04.md`. The 2026-04-20 model-choice spike reported B1 extracting to a single canonical page (5,694 chars). This investigation determines whether that result reflects the production pipeline's behaviour, and whether Phase 4's entity-propagation premise should proceed, defer, or redesign.

## TL;DR

**The spike's 1-page extraction result is a spike-script artefact, not a production pipeline behaviour.** The production pipeline extracts B1 as 4 canonical pages (confirmed from cr17 production logs: `{"message":"Extraction complete","docId":"cmo6fwocl004001oe4xb1bs1j","pages":4,"totalChars":5596}`). The spike script bypasses the canonical-PDF-then-DI flow and directly hits `extractFromDocx` → mammoth, which **hardcodes a 1-page return** regardless of document length.

**The `javaldx` warning is cosmetic.** Adding `default-jre` to the Docker image does NOT remove it (LibreOffice-nogui's javaldx helper isn't wired to the standard JRE layout on Debian), and does NOT change page counts. Conversion exits 0 and produces correct multi-page output regardless.

**Phase 4 premise holds.** Every other DOCX fixture in the corpus produces multi-page canonical output (8 pages each for the three I tested). Documents longer than 6 canonical pages trigger the `BATCH_SIZE=3` split post-Phase-1-item-4, which is where Hypothesis C's cross-batch continuity problem matters. B1 at 4 pages is below the single-batch guard and isn't a useful cross-batch test; the Phase 2 `B3_Long_Investigation.pdf` (10 pages, authored in Phase 2) is the correct test fixture.

**Recommendation: Phase 4 proceeds as drafted. No Dockerfile change, no redeploy. Close out the spike-was-artefactual finding in the implementation log.**

---

## Investigation trail

### Step 1 — Local macOS reproduction

Command (matches `lib/pipeline/redact-pdf.ts:296–318`):

```
libreoffice --headless --norestore --convert-to pdf --outdir /tmp/p15-local /tmp/p15-local/input.docx
```

Environment: macOS 25.2.0, LibreOffice 26.2.2.2 (Homebrew), Java system-wide present.

Result:
- Exit 0, 2.5s wall.
- No `javaldx` warning emitted.
- Produced PDF: **3 pages**, 5,623 chars (PyMuPDF count).

### Step 2 — Docker reproduction matching the prod runtime

Built a test image from `node:20-slim` with the same apt-install line as `Dockerfile:20–23` (`libreoffice-nogui fonts-noto-core` + PyMuPDF). LibreOffice version in Debian: **7.4.7.2** (noticeably older than macOS's 26.2.2.2).

Result:
- Exit 0, wall ~2–3s.
- `Warning: failed to launch javaldx - java may not function correctly` on stderr.
- Produced PDF: **4 pages**, 1,089 + 1,874 + 2,574 + 88 = 5,625 chars.

Key observation: **exit code is 0 despite the javaldx warning.** The conversion succeeds. Node's `execFile` in `redact-pdf.ts:297–318` only rejects when exit is non-zero, timeout, or buffer-overflow — none of which happens here. So the javaldx warning alone does NOT cause the prod "Canonical PDF build failed" errors.

### Step 3 — Java hypothesis test

Rebuilt the image with `default-jre-headless` added to the apt-install line. Then separately tested with full `default-jre` installed at container runtime.

Result:
- Both `default-jre-headless` and `default-jre` installations: `javaldx` warning **still fires**.
- Page count unchanged: **4 pages**.
- LibreOffice-nogui's `javaldx` helper expects Java in a specific location not matched by Debian's standard JRE packaging. Installing Java doesn't suppress the warning.

**Java is not the root cause of either the warning or any behaviour difference.** Dockerfile does NOT need `default-jre`.

### Step 4 — Other DOCX fixtures

Converted three other `dummy-lgoima-pack/` DOCX fixtures in the no-Java Docker image:

| Fixture | Pages | Chars |
|---|---|---|
| `01_.../04_main_case_file_long.docx` | **8** | 14,957 |
| `01_.../05_internal_briefing_and_recommendation.docx` | **8** | 14,490 |
| `01_.../06_supporting_statements_and_appendices.docx` | **8** | 14,499 |

All multi-page. The pipeline's canonical-PDF → DI-extraction flow produces 8 pages for each. None of them collapse to 1 page. **B1 at 4 pages is the short outlier**, not evidence of a pipeline-level page-coalescing bug.

### Step 5 — Production canonical PDF page count

Confirmed from cr17 production logs (before my cr17 restart, seen in the log bundle I fetched for the cr17 deploy verify):

```
{"timestamp":"2026-04-20T00:12:00.309Z","level":"info","message":"Document classification complete","module":"pipeline","docId":"cmo6fwocl004001oe4xb1bs1j","documentType":"investigation-report",...}
{"timestamp":"2026-04-20T00:11:59.034Z","level":"info","message":"Extraction complete","module":"pipeline","docId":"cmo6fwocl004001oe4xb1bs1j","pages":4,"totalChars":5596}
{"timestamp":"2026-04-20T00:12:41.887Z","level":"info","message":"DOCX conversion complete","module":"format-converter","filename":"B1_HR_Investigation_Report_Kellogg_Ferguson.docx","blocks":29,"htmlLength":8172,"notes":0}
```

**B1 in production = 4 canonical pages, 5,596 chars, 29 content blocks.** The content-blocks count being 29 (not 1) is independent corroboration that structure survives extraction.

### Step 6 — Why the spike reported 1 page

The spike runner at `scripts/spike-o4-mini.ts:105–109` calls:

```ts
const buf = fs.readFileSync(B1_PATH);
const ext = path.extname(B1_PATH).slice(1).toUpperCase();  // "DOCX"
const result = await extractText(buf, ext);
```

`extractText("DOCX")` routes to `extractFromDocx` at `lib/pipeline/extract.ts:144–156`:

```ts
async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value || "";
  const pages: ExtractedPage[] = [
    { pageNumber: 1, text },          // ← hardcoded 1 page
  ];
  return { pages, totalText: text };
}
```

Mammoth has no page awareness; it extracts raw text from the DOCX OOXML stream. The code wraps all output in a single `pageNumber: 1` entry. This is the code path the spike script exercised — **NOT** the production pipeline's canonical-PDF-then-DI path, which routes through `process.ts:284–289` to `extractText(canonicalPdfBuffer, "PDF")` and uses DI's `prebuilt-read` model against the LibreOffice-rendered PDF.

The spike's `docs/spike-model-comparison-2026-04-20/b1-extracted-pages.json` therefore contains mammoth's single-page flat text, not the production pipeline's multi-page DI output. For any future spike that wants to test the production extraction path on DOCX, it should either call `processDocument` end-to-end or run `buildCanonicalPdf()` first and then `extractText(canonicalBuffer, "PDF")`.

This also explains the spike's observation that "all 6 runs were single-batch" — the AI received a 1-page prepared-pages array from the cached mammoth extraction, regardless of cr17's single-batch guard. In production, with a 4-page canonical, the same pre-cr17 detection path would have run as 2 batches (pages 1–3 + page 4), and post-cr17 would run as 1 batch (4 ≤ `AI_DETECT_SINGLE_BATCH_MAX_PAGES` default 6).

---

## Unrelated observation: intermittent prod "Canonical PDF build failed" errors

The cr17 deploy log review surfaced three `Canonical PDF build failed, continuing with legacy flow` warnings between 00:57 and 03:49 on 2026-04-20, affecting doc IDs `cmo6hinyq005y01mv9j9hh232`, `cmo6j89r900e201mv7fgqwsbb`, and `cmo6nop8g000001o933epzpwt`. Each error message contains both `Command failed:` (indicating Node's `execFile` saw a non-zero exit or other execFile error) AND the cosmetic javaldx warning.

This investigation **does not establish a root cause** for those intermittent failures. The javaldx warning is cosmetic and fires on every DOCX conversion (including successful ones) regardless of whether Java is installed. Possible real causes for the intermittent non-zero exits:

- LibreOffice timeout under memory pressure on the B1 App Service SKU (1.75 GB RAM, 1 core). LibreOffice-nogui cold-start under load may hit the pipeline's 120-second `execFile` timeout.
- Concurrent conversions (two docs in the same pipeline batch) — LibreOffice's headless profile lock may cause the second invocation to fail.
- Specific DOCX content triggering a LibreOffice filter bug that exits non-zero inconsistently.

These are **follow-up investigations**, not part of Phase 1.5. Fallback path is already in place: when canonical build fails, extraction uses mammoth (1-page DOCX result), detection runs with reduced fidelity, and the document still completes processing. Worth tracking separately to understand frequency and whether it affects demo-critical documents.

---

## Decision output

**Phase 4 of the detection-coverage plan proceeds as drafted.**

- Phase 4's premise (3-page batch boundaries cause cross-batch entity continuity failures) is valid for any document whose canonical PDF exceeds 6 pages — which is true of every multi-page DOCX I tested except B1.
- B1 is a poor test fixture for Phase 4 because its 4-page canonical falls below the Phase-1 single-batch guard threshold (6).
- The Phase 2 fixture `test-fixtures/bench/B3_Long_Investigation.pdf` (10 pages, authored in Phase 2) is the correct test fixture. The plan already specifies this.
- No Phase 4 scope change needed. No Phase 4 deferral needed. No Phase 4 redesign needed.

**No Dockerfile change. No cr18 deploy.**

- Adding `default-jre` or `default-jre-headless` does NOT suppress the cosmetic javaldx warning.
- Neither Java installation changes page counts or conversion success.
- The Dockerfile is fine as-is for Phase 1.5 purposes.

**Follow-up items (out of scope for Phase 1.5):**

1. Investigate the intermittent "Canonical PDF build failed" errors on `app-veil-prototype` (three observed on 2026-04-20). Likely causes: App Service memory pressure, concurrent-conversion LibreOffice profile locking, or filter-specific DOCX content. Low-priority because the fallback path works. Track as a separate ops ticket.
2. Audit the spike runner's `extractText(DOCX-buffer, "DOCX")` call pattern. Any future spike or bench harness testing the production DOCX flow should go through `buildCanonicalPdf` first, not call `extractText` with the raw DOCX. Noted in the spike document for posterity but no code change required — the spike was a one-shot tool.
3. Phase 4 authoring of `B3_Long_Investigation.pdf` remains in Phase 2's scope (per the v3.1 plan). When authored, confirm its canonical-PDF page count exceeds 6 (so it forces the `BATCH_SIZE=3` split) before running the Phase 4 benchmark.

---

## Summary table

| Question | Answer | Evidence |
|---|---|---|
| Does B1 extract to 1 page in production? | No — 4 pages. | cr17 prod log `Extraction complete, pages:4, totalChars:5596` |
| Does B1 extract to 1 page under the spike runner? | Yes. | Cached `b1-extracted-pages.json` shows 1 page. |
| Why the discrepancy? | Spike calls `extractText(buf, "DOCX")` → `extractFromDocx` (mammoth) which hardcodes 1 page. Production calls `buildCanonicalPdf` first, then `extractText(canonicalBuffer, "PDF")` → DI which respects page breaks. | `lib/pipeline/extract.ts:144–156`, `lib/pipeline/process.ts:284–289` |
| Does adding `default-jre` to the Dockerfile help? | No. | Step 3 — javaldx warning persists; page count unchanged at 4. |
| Do other DOCX fixtures collapse to 1 page? | No — all three tested produce 8 pages in Docker. | Step 4 table above. |
| Is Phase 4's cross-batch-entity-continuity premise valid? | Yes, for docs >6 canonical pages. B1 at 4 is too short. | All non-B1 DOCX fixtures exceed the 6-page single-batch threshold. |
| Phase 4 disposition | **Proceed as drafted.** | B3_Long_Investigation.pdf (Phase 2) is the correct test fixture. |
| Dockerfile change | **None.** | javaldx is cosmetic; no behaviour impact. |
