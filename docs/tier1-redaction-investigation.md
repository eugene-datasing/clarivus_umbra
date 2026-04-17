# Veil Tier 1 PDF Redaction — Diagnostic Investigation

Read-only investigation of two defects observed on the Tier 1 (PDF-originals, coordinate-based) redaction path. No code was modified during this pass.

**Artefact under test:** `07_formal_report_redacted-*.pdf` produced by the Veil pipeline on the PNCC demo tenant.

**Symptoms observed previously:**

1. Oversized black rectangles covering entire sections of the page (up to ~84 % width × ~18 % height).
2. Obvious PII (email address, phone number) appearing multiple times in the source document but only redacted once — the remaining occurrences leak through to the output.

---

## Part A — Deduplication behaviour (priority 1)

### A.1 Sites where detections are deduplicated on the Tier 1 path

There are **four** dedup sites touching a Tier 1 redaction. Only **one** of them actually removes duplicates before coordinates are committed to the database.

---

#### Site 1 — Pipeline ingest-time dedup (the critical one)

**File:** `lib/pipeline/process.ts:577-592`

```typescript
// Deduplicate by (page, type, text). Keep the entry with highest confidence.
const beforeDedup = allDetections.length;
const seen = new Map<string, number>();
const dedupedDetections: UnifiedDetection[] = [];

for (const det of allDetections) {
  const key = `${det.page}|${det.type}|${det.text.toLowerCase().trim()}`;
  const existingIdx = seen.get(key);
  if (existingIdx !== undefined) {
    if (det.confidence > dedupedDetections[existingIdx].confidence) {
      dedupedDetections[existingIdx] = det;
    }
    continue;
  }
  seen.set(key, dedupedDetections.length);
  dedupedDetections.push(det);
}
```

- **Dedup key:** `(page, type, text.toLowerCase().trim())`
- **Coordinates are NOT part of the key.**
- Happens **before** `calculateBBox()` is called at `lib/pipeline/process.ts:607`, because pattern / AI / custom-rule detectors do not emit coordinates at all — the bbox is derived later from the surviving detection row.
- Net effect: for every `(page, type, text)` triplet, exactly one Detection row reaches the DB. `bbox` is then populated for that single row only.

There is also an earlier cross-source dedup at `lib/pipeline/process.ts:501-511` that strips custom-rule matches overlapping with pattern / AI text on the same page, but that is a superset filter — the master collapse happens at lines 577-592.

---

#### Site 2 — Tier 1 coordinate-based redaction (read-only)

**File:** `lib/pipeline/redact-pdf.ts:56-59`

```typescript
const acceptedDetections = await prisma.detection.findMany({
  where: { documentId, status: "accepted" },
  orderBy: [{ page: "asc" }, { posY: "asc" }],
});
```

- No dedup.
- Emits one rectangle per DB row.
- Because Site 1 has already collapsed the rows, Tier 1 faithfully redacts exactly one box per unique `(page, type, text)` — **and only one, no matter how many times the text appears in the document**.

---

#### Site 3 — Text-search dedup (Tier 2 only)

**File:** `lib/pipeline/redact-pdf.ts:268-289` — `dedupeTextSearchRedactions`

```typescript
const key = `${det.page}|${det.text}`;
if (seen.has(key)) continue;
seen.add(key);
```

- **Dedup key:** `(page, text)` (no `type`).
- Only reached by the Tier 2 text-search branch.
- Safe here because the downstream Python searches every page for every unique string.

---

#### Site 4 — Python-side dedup (Tier 2 only, already fixed)

**File:** `lib/pipeline/redact_pdf_pymupdf.py:99-101`

```python
if search_text in processed:
    skipped_dupes += 1
    continue
```

- Text-only dedup, searches all pages. Fixed during the pre-demo push.

---

#### Schema confirmation — no DB-level uniqueness

**File:** `prisma/schema.prisma:151-183`

```prisma
model Detection {
  ...
  posX            Float   @default(0)
  posY            Float   @default(0)
  posW            Float   @default(0)
  posH            Float   @default(0)
  ...
  @@index([documentId])
  @@index([status])
  @@map("detections")
}
```

No `@@unique` on `(documentId, page, type, text)`. Multiple rows for the same entity at different positions are schema-legal — the dedup is entirely behavioural and lives in Site 1.

---

### A.2 Trace: "Rohan Patel" appearing three times on page 1

Assume the pattern detector finds three exact matches on page 1 at vertical positions 10 %, 50 %, 80 %.

1. `lib/pipeline/patterns.ts` emits three `{type:"person-name", text:"Rohan Patel", page:1, …}` objects.
2. They are unioned with AI + custom-rule results into `allDetections` at `process.ts:540`.
3. The dedup loop at `process.ts:581-592` computes the same key `1|person-name|rohan patel` for all three and keeps **one** — whichever arrives first (or whichever has the highest confidence, per the `>` check).
4. A single Detection row is inserted at `process.ts:610-625`.
5. `calculateBBox("Rohan Patel", pageWords, pageW, pageH)` is called at `process.ts:608`. In `lib/pipeline/bbox.ts:42-55` the sliding-window loop returns on the **first** consecutive-word match:

   ```typescript
   for (let start = 0; start < words.length; start++) {
     let concat = "";
     for (let end = start; end < words.length && end < start + 50; end++) {
       if (end > start) concat += " ";
       concat += words[end].text;
       const normalized = concat.toLowerCase().replace(/\s+/g, " ");
       if (normalized.includes(target)) {
         return computeBoxFromWords(words.slice(start, end + 1), pageWidth, pageHeight);
       }
     }
   }
   ```

   → returns the bbox of the **first** occurrence only.
6. Tier 1 redacts ONE rectangle at the first occurrence. The instances at 50 % and 80 % remain fully visible.

This matches the observed behaviour: a chronology table where the same email and phone appear multiple times is redacted on the first line and left intact on every subsequent line.

---

### A.3 Smallest possible change — proposed new key

Two related problems need to be addressed together:

| Problem | Current behaviour | Required |
|---|---|---|
| Pattern + AI + custom-rule agree on the same text at the same position | Collapse to one (good) | Still collapse |
| Same text appears at multiple positions | Collapse to one (bad) | Keep all positions |

**Recommended key** (smallest code change that fixes the bug):

```typescript
// Compute bbox BEFORE dedup, then dedup on (page, type, text, posY_rounded).
// A rounded posY is a reliable per-occurrence discriminator; posX is less so
// when the same string appears in a column that starts at the same X.
const key = `${det.page}|${det.type}|${det.text.toLowerCase().trim()}|${Math.round(det.posY * 10) / 10}`;
```

This requires two restructuring steps:

1. **Move `calculateBBox` into the detection-source fan-out** (patterns.ts / ai-detect.ts / custom-rules.ts) or into an explicit "enrich with coords" pass **before** the dedup loop. Pattern detection has the page index of every match, so it can already produce all occurrences; `calculateBBox` today stops at the first — it would need to return all matches (`calculateBBoxAll`) and each source would emit N detection objects instead of 1.
2. **Update the dedup key** to include `posY` (rounded to 1 dp) so distinct occurrences survive while pattern-vs-AI agreement on the same line still collapses.

Alternative minimalist fix: extend the key to include a monotonically increasing per-source occurrence index (`matchIndex`). That avoids the round-trip through bbox but leaves pattern-vs-AI agreement open (they wouldn't share an index). So the `posY`-in-key approach is the correct shape.

---

## Part B — Coordinate granularity (priority 2)

### B.1 Azure Document Intelligence call

**File:** `lib/pipeline/extract.ts:92-138`

```typescript
const result = await resilientDocIntelCall(async () => {
  const poller = await client.beginAnalyzeDocument("prebuilt-read", buffer);
  return poller.pollUntilDone();
});
```

- **Model:** `prebuilt-read`
- **API:** `@azure/ai-form-recognizer` `DocumentAnalysisClient.beginAnalyzeDocument`
- **API version:** implicit (SDK default; no override in the client construction at `extract.ts:77-81`).

`prebuilt-read` returns `page.words[]` with per-word polygons (4-point quads), which is what the pipeline already consumes:

```typescript
if (page.words) {
  for (const w of page.words) {
    words.push({
      text: w.content,
      confidence: w.confidence,
      polygon: w.polygon
        ? w.polygon.flatMap((p) => [p.x, p.y])
        : undefined,
    });
  }
}
```

**`prebuilt-read` vs `prebuilt-layout`:** for the specific purpose of getting word-level polygons, `prebuilt-read` is sufficient. `prebuilt-layout` adds selection marks, paragraphs, and structured tables — useful for improving detection context but **not** the cause of the oversize-box bug. Switching to `prebuilt-layout` is a broader change and is not required for Part B's proximate fix.

### B.2 Coordinate aggregation — the real source of oversized boxes

**File:** `lib/pipeline/bbox.ts:66-97`

```typescript
function computeBoxFromWords(
  matchedWords: WordLayout[],
  pageWidth?: number,
  pageHeight?: number,
): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const word of matchedWords) {
    if (!word.polygon || word.polygon.length < 8) continue;
    for (let i = 0; i < word.polygon.length; i += 2) {
      const x = word.polygon[i];
      const y = word.polygon[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  ...
}
```

`computeBoxFromWords` returns the axis-aligned **union** of every polygon corner it is handed. Combined with the sliding-window match in `calculateBBox`:

```typescript
for (let end = start; end < words.length && end < start + 50; end++) {
  if (end > start) concat += " ";
  concat += words[end].text;
  const normalized = concat.toLowerCase().replace(/\s+/g, " ");
  if (normalized.includes(target)) {
    return computeBoxFromWords(words.slice(start, end + 1), pageWidth, pageHeight);
  }
}
```

The window concatenates adjacent words with spaces regardless of line breaks. `prebuilt-read` returns words in reading order, so when a detection's text spans two physical lines (e.g. an AI-generated narrative: "Subject line Rohan Patel lives at 12 Main Street and can be reached…"), the matched slice contains words from multiple lines. The union bbox then stretches from line-1-top to line-N-bottom and from the leftmost word to the rightmost — producing the exact shape seen in the field (~84 % wide × ~18 % tall).

Even short detections can produce oversized rectangles:

- Pattern match crosses a hyphenated line break (`12-3056-\n0789123-00`) — two line-heights of height.
- AI returns a paragraph-style summary as `text` (string > 80 chars) — rejected by Tier 2's `TEXT_SEARCH_MAX_LENGTH = 80` filter at `lib/pipeline/redact-pdf.ts:249`, but **Tier 1 has no such filter** at all, so these long strings flow through the sliding window and produce section-sized boxes.

### B.3 Real detection coordinates

Direct DB query to the Azure tenant was attempted but the PostgreSQL Flexible Server is currently refusing connections from this host (likely a firewall rule change after the reset + redeploy). From the earlier diagnostic against the same document we already observed detection rows with `posW ≈ 83.87 %` and `posH ≈ 18.40 %` — numbers that are inconsistent with word-level polygons (a single ~12 pt word on A4 occupies roughly `posH ≈ 1.0–1.5 %`). That is exactly what the sliding-window multi-line union produces, and it corroborates the code-level analysis above.

### B.4 Smallest possible change

**Change 1 — line-aware aggregation in `bbox.ts`:**
Group matched words by Y-center within a tolerance (≈ one line height) and emit one rectangle per line. Update the return type to `BBox[]`.

**Change 2 — schema shape:**
Current Detection row has a single `(posX, posY, posW, posH)` quad. Two options:

- A. Store an array of rectangles in a JSON column (`regions: Json[]`) and keep `posX..posH` as the primary rect for list sorting.
- B. Emit multiple Detection rows per entity occurrence per line (one row per rectangle), using the dedup-key fix in Part A.3 to keep them distinct.

Option B is structurally cleaner: every Detection row maps 1:1 to one redaction rectangle, and the review UI already sorts by `(page, posY)`. Option A avoids schema growth but needs the Python redactor to walk an array.

Either way the *detection* remains one semantic match to the reviewer; only the *rendering* produces multiple rectangles.

---

## Part C — Tier 2 fallback viability for PDFs

### C.1 What the fallback already is

**File:** `lib/pipeline/redact-pdf.ts:63-98`

```typescript
// Tier 1: PDF originals — coordinate-based redaction
if (isPdf) {
  try {
    return await redactOriginalPdf(doc, acceptedDetections);
  } catch (err) {
    console.warn(...);
    // Fall through to text-search on the original PDF
  }
}

// Tier 2: Convert to PDF (if needed) + text-search redaction
if (doc.originalPath) {
  try {
    ...
    let pdfBuffer: Buffer;
    if (isPdf) {
      // PDF coordinate redaction failed above — try text-search on the original
      pdfBuffer = originalBuffer;
    } else {
      pdfBuffer = await convertToPdfWithLibreOffice(originalBuffer, doc.fileType);
    }
    return await redactByTextSearch(pdfBuffer, acceptedDetections);
  }
  ...
}
```

For a PDF original the Tier 2 branch skips LibreOffice and calls PyMuPDF text-search directly — a roughly zero-cost extension of what the engine already does for DOCX and XLSX.

### C.2 Fidelity

- **Text-layer PDFs** (exported from Word, LibreOffice, Chrome "Save as PDF", etc.): PyMuPDF `page.search_for()` finds every occurrence, returns tight per-match rectangles. This is actually **higher** fidelity than the current Tier 1 for multi-occurrence entities because every instance is individually bounded.
- **Scanned / OCR-only PDFs:** no text layer, `search_for` returns no results. For these documents Tier 1 (Azure DI coordinates) remains the only viable path. This is the strongest argument for fixing Tier 1 rather than replacing it.
- **Mixed unicode / macrons / ligatures:** generally reliable; edge cases exist when Mammoth-style NFC vs NFD normalisation drifts, but these are the same risks that Tier 2 is already carrying for DOCX.

### C.3 Performance

PyMuPDF text-search on a 50-page PDF with ~30 unique detection strings runs in well under a second in our existing Tier 2 benchmarks. LibreOffice is *not* invoked for PDF originals, so the "Tier 2 for PDFs" path has no cold-start cost.

### C.4 Caveats

- Tier 1 currently throws only on catastrophic PyMuPDF failures. The "over-drawn rectangle" bug does not throw — it succeeds with a visibly wrong output. A fallback that only fires on exception will therefore never activate for the documents we care about. The correct use of text-search-as-fallback is not "on exception" but "when we have reasons to distrust the coord mode" — and that needs a positive signal such as "at least one surviving detection has `posW > 40 %` or `posH > 5 %`".
- Text-search cannot target text that was extracted via OCR but is not present in the PDF content stream (i.e. scanned PDFs).

### C.5 Recommendation

Keep the existing fallback chain. Additionally, on the PDF-original path, **guard** the Tier 1 result: if any emitted redaction rectangle exceeds a sanity threshold (e.g. `posW > 40 %` or `posH > 5 %`), retry via text-search for that subset of detections. This turns the observed silent failure into a self-healing path.

---

## Recommended fix order

1. **Part A — dedup bug.** Highest correctness impact; fixes the most visible demo failure (missing PII on repeated occurrences). Move bbox computation ahead of dedup, extend key to include rounded `posY`, or emit per-occurrence Detection rows.
2. **Part B — bbox aggregation.** Changes `computeBoxFromWords` to group by line; emit multi-rect output. Required so that once Part A lets multiple occurrences through, the individual rectangles are no longer oversized.
3. **Part C — sanity fallback.** Post-Tier-1 "overdrawn rectangle" check that retries via text-search. Acts as a safety net while Parts A and B land and catches future regressions.

## Files referenced

| File | Lines | Role |
|---|---|---|
| `lib/pipeline/process.ts` | 540-627 | Unified detection list + dedup + per-row bbox computation |
| `lib/pipeline/redact-pdf.ts` | 56-101, 108-184, 268-349 | Tier 1 entry, coordinate redaction, text-search dedup, Tier 2 entry |
| `lib/pipeline/redact_pdf_pymupdf.py` | 35-130 | Python coordinate and text-search modes |
| `lib/pipeline/extract.ts` | 92-138 | Azure DI `prebuilt-read` call + word polygon extraction |
| `lib/pipeline/bbox.ts` | 29-107 | Sliding-window match + union-bounding-box |
| `prisma/schema.prisma` | 151-183 | Detection model (no uniqueness constraints) |

## Outstanding items

- Re-run the DB-side coordinate confirmation once Azure Flexible Server accepts connections again. The code-level analysis is self-consistent, but a one-line `SELECT` of the problem document's detection rows would be final confirmation of the `posW` / `posH` magnitudes.
