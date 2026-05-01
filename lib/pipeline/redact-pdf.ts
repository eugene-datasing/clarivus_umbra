/**
 * Redaction engine — applies permanent redaction to PDF documents.
 *
 * Three-tier approach:
 *
 * 1. Coordinate-based (PDFs only): calls PyMuPDF with bounding-box
 *    coordinates from Azure Document Intelligence. Best quality — true
 *    redaction at exact positions preserving original layout.
 *
 * 2. LibreOffice convert + text-search (any format): converts the
 *    original document to PDF via LibreOffice headless, then uses
 *    PyMuPDF text search to locate detection text and apply true
 *    redaction. Preserves original formatting (tables, images, styles).
 *
 * 3. Text-based PDF (last resort): generates a new plain-text A4 PDF
 *    from extracted page text with redaction markers. Loses all
 *    formatting but guarantees output for every document.
 */

import { PDFDocument, rgb } from "pdf-lib";
import { embedFonts } from "./pdf-fonts";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { getGroundById } from "@/lib/lgoima-grounds";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { logger } from "@/lib/logger";

interface RedactedResult {
  pdfBytes: Uint8Array;
  redactionCount: number;
  pageCount: number;
}

/** File types that LibreOffice can convert to PDF with good fidelity. */
export const LIBREOFFICE_CONVERTIBLE = new Set([
  "docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp",
  "rtf", "txt", "csv", "html", "htm",
]);

/**
 * Build a redacted PDF for a document.
 *
 * Named branch (Phase 1, viewer rework):
 *   - If the Document has a canonical PDF persisted
 *     (doc.canonicalPdfPath is set), redact that instead of the original.
 *   - Otherwise fall back to the legacy three-tier behaviour — kept
 *     intact until every row has a canonical PDF (backfill + forward
 *     path). This is a deliberate transition fence, not a code smell.
 *     See docs/viewer-rework-plan-2026-04.md Phase 1 §5.
 */
export async function buildRedactedPdf(documentId: string): Promise<RedactedResult> {
  const peek = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: { canonicalPdfPath: true },
  });

  if (peek.canonicalPdfPath) {
    return redactCanonicalPdf(documentId);
  }
  return redactLegacy(documentId);
}

/**
 * Canonical-PDF redaction path — Phase 1 of the viewer rework.
 *
 * Runs the same tiered PyMuPDF strategy but against the persisted canonical
 * PDF rather than the original:
 *   1. Coordinate redaction on the canonical PDF, for detections whose
 *      bboxes are non-zero. For PDFs (canonical = original) this is the
 *      usual Tier 1. For DOCX / EML / MSG where Phase 1 leaves bboxes
 *      at (0, 0, 0, 0), the filter is empty and this tier is skipped —
 *      Phase 2 will populate bboxes against the canonical PDF.
 *   2. Text-search redaction directly against the canonical PDF. No
 *      LibreOffice re-conversion needed — the canonical PDF is already
 *      what today's Tier 2 produces on-demand.
 *   3. Plain-text PDF fallback (unchanged).
 */
async function redactCanonicalPdf(documentId: string): Promise<RedactedResult> {
  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
  });

  if (!doc.canonicalPdfPath) {
    throw new Error(
      `redactCanonicalPdf invoked but doc has no canonicalPdfPath: ${documentId}`,
    );
  }

  const acceptedDetections = await prisma.detection.findMany({
    where: { documentId, status: "accepted" },
    orderBy: [{ page: "asc" }, { posY: "asc" }],
  });

  const usableBboxes = acceptedDetections.filter(
    (d) => d.posW > 0 && d.posH > 0,
  );
  // Zero-bbox accepted detections — typically AI long-narrative or
  // paraphrase emissions whose text was emitted before the
  // skipLongTextGuard fix landed (forward-only, see fix/zero-bbox-ai
  // PR), or whose text genuinely doesn't match the page words. Pre-fix
  // these were silently dropped at Tier 1's bbox filter and never
  // reached Tier 2 because Tier 2 only ran when EVERY accepted
  // detection was zero-bbox. Now Tier 2 chains after Tier 1 on the
  // same canonical PDF specifically for these rows.
  const zeroBboxDetections = acceptedDetections.filter(
    (d) => d.posW === 0 || d.posH === 0,
  );

  // Tier 1: coordinate redaction on the canonical PDF. Reuses
  // redactOriginalPdf by passing a doc shim whose "originalPath" points
  // at the canonical PDF's storage key — redactOriginalPdf only touches
  // doc.id and doc.originalPath, so this is safe.
  if (usableBboxes.length > 0) {
    try {
      const tier1Result = await redactOriginalPdf(
        { id: doc.id, batchId: doc.batchId, originalPath: doc.canonicalPdfPath },
        usableBboxes,
      );

      // Chain: if any accepted detections lack a usable bbox, run
      // text-search through the already-coordinate-redacted Tier 1
      // output so they get redacted via PyMuPDF's text matcher rather
      // than silently skipped. No extra storage download — feed the
      // Tier 1 buffer straight in.
      if (zeroBboxDetections.length > 0) {
        try {
          const tier1Buffer = Buffer.from(tier1Result.pdfBytes);
          const chainedResult = await redactByTextSearch(
            tier1Buffer,
            zeroBboxDetections,
            // Bypass the 80-char guard inside dedupeTextSearchRedactions —
            // zero-bbox detections are typically AI long-narrative
            // emissions > 80 chars (that length is exactly why they
            // landed at zero-bbox), and this chain pass is the only
            // path that can redact them. PyMuPDF's text search silently
            // misses on paraphrases, so passing long text through is
            // safe.
            { skipLongTextGuard: true },
          );
          console.log(
            `[redact-pdf] Tier 2 chain redacted ${zeroBboxDetections.length} zero-bbox detection(s) on top of Tier 1 output for ${doc.id}`,
          );
          return {
            pdfBytes: chainedResult.pdfBytes,
            redactionCount:
              tier1Result.redactionCount + chainedResult.redactionCount,
            pageCount: chainedResult.pageCount,
          };
        } catch (chainErr) {
          console.warn(
            `[redact-pdf] Tier 2 chain on zero-bbox detections failed for ${doc.id}; returning Tier 1 result:`,
            chainErr instanceof Error ? chainErr.message : chainErr,
          );
          // Fall through and return the Tier 1 result without the
          // text-search chain. Worst case the zero-bbox rows aren't
          // redacted in this export; better than failing the whole
          // export.
        }
      }

      return tier1Result;
    } catch (err) {
      console.warn(
        `[redact-pdf] Coordinate redaction on canonical failed for ${doc.id}, trying text-search:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Tier 2 standalone: text-search against the canonical PDF when
  // either no detections had usable bboxes or Tier 1 itself errored.
  try {
    const storage = getStorage();
    const canonicalBuffer = await storage.download(doc.canonicalPdfPath);
    return await redactByTextSearch(canonicalBuffer, acceptedDetections);
  } catch (err) {
    console.warn(
      `[redact-pdf] Text-search on canonical failed for ${doc.id}, falling back to text PDF:`,
      err instanceof Error ? err.message : err,
    );
  }

  // Tier 3: plain-text fallback.
  return generateTextPdf(doc, acceptedDetections);
}

// TODO: remove after canonical backfill complete;
// see docs/viewer-rework-plan-2026-04.md Phase 1 §5.
async function redactLegacy(documentId: string): Promise<RedactedResult> {
  const doc = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
  });

  const acceptedDetections = await prisma.detection.findMany({
    where: { documentId, status: "accepted" },
    orderBy: [{ page: "asc" }, { posY: "asc" }],
  });

  const isPdf = doc.fileType.toLowerCase() === "pdf";

  // Tier 1: PDF originals — coordinate-based redaction
  if (isPdf) {
    try {
      return await redactOriginalPdf(doc, acceptedDetections);
    } catch (err) {
      console.warn(
        `[redact-pdf] Coordinate redaction failed for ${doc.id}, trying text-search:`,
        err instanceof Error ? err.message : err,
      );
      // Fall through to text-search on the original PDF
    }
  }

  // Tier 2: Convert to PDF (if needed) + text-search redaction
  if (doc.originalPath) {
    try {
      const storage = getStorage();
      const originalBuffer = await storage.download(doc.originalPath);

      let pdfBuffer: Buffer;
      if (isPdf) {
        // PDF coordinate redaction failed above — try text-search on the original
        pdfBuffer = originalBuffer;
      } else {
        // Non-PDF: convert to PDF via LibreOffice
        pdfBuffer = await convertToPdfWithLibreOffice(originalBuffer, doc.fileType);
      }

      return await redactByTextSearch(pdfBuffer, acceptedDetections);
    } catch (err) {
      console.warn(
        `[redact-pdf] Conversion/text-search failed for ${doc.id}, falling back to text PDF:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Tier 3: Plain text PDF (last resort)
  return generateTextPdf(doc, acceptedDetections);
}

// ---------------------------------------------------------------------------
// PDF originals — true redaction via PyMuPDF subprocess
// ---------------------------------------------------------------------------

async function redactOriginalPdf(
  doc: { id: string; batchId: string; originalPath: string | null },
  detections: Array<{
    posX: number;
    posY: number;
    posW: number;
    posH: number;
    appliedGround: string | null;
    suggestedGround: string | null;
    page: number;
  }>,
): Promise<RedactedResult> {
  if (!doc.originalPath) {
    throw new Error("No original file path available for PDF redaction");
  }
  const storage = getStorage();
  const buffer = await storage.download(doc.originalPath);

  // Prepare redaction data for the Python script. The dedup step
  // collapses overlapping/contained/duplicate bboxes into one entry
  // per spatial group with the most-restrictive ground — see
  // dedupeCoordinateRedactions for the algorithm. Without this,
  // PyMuPDF's add_redact_annot draws each Detection row's citation
  // independently, and near-overlapping rows (e.g. section-marker
  // free-frank sentences sharing an edge with entity-propagation
  // surnames) produce visibly doubled / offset citations on the
  // exported PDF (Bug 6 from cr28 verification).
  const beforeDedup = detections.length;
  const redactions = dedupeCoordinateRedactions(detections);
  if (beforeDedup !== redactions.length) {
    console.log(
      `[redact-pdf] Coordinate-mode deduped: ${beforeDedup} → ${redactions.length} redaction entries`,
    );
  }

  // Write input PDF and redaction JSON to temp files
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "veil-redact-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.pdf");
  const jsonPath = path.join(tmpDir, "redactions.json");
  const scriptPath = path.resolve(process.cwd(), "lib/pipeline/redact_pdf_pymupdf.py");

  try {
    await fs.writeFile(inputPath, buffer);
    await fs.writeFile(jsonPath, JSON.stringify(redactions));

    // Call PyMuPDF via subprocess
    await new Promise<void>((resolve, reject) => {
      execFile(
        "python3",
        [scriptPath, inputPath, outputPath, jsonPath],
        { timeout: 120_000 },
        (error, stdout, stderr) => {
          if (error) {
            logger.error("[redact-pdf] PyMuPDF stderr:", { error: String(stderr) });
            reject(new Error(`PyMuPDF redaction failed: ${error.message}`));
          } else {
            console.log("[redact-pdf] PyMuPDF result:", stdout.trim());
            resolve();
          }
        },
      );
    });

    const pdfBytes = await fs.readFile(outputPath);

    // Count pages from the output
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    return {
      pdfBytes: new Uint8Array(pdfBytes),
      redactionCount: detections.length,
      pageCount,
    };
  } finally {
    // Clean up temp files
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Non-PDF originals — convert to PDF via LibreOffice then text-search redact
// ---------------------------------------------------------------------------

/**
 * Convert a non-PDF document to PDF using LibreOffice headless.
 *
 * Works well for DOCX, XLSX, PPTX, RTF, TXT, CSV, HTML.
 * EML/MSG are not supported by LibreOffice — those fall through to Tier 3.
 */
export async function convertToPdfWithLibreOffice(
  buffer: Buffer,
  fileType: string,
): Promise<Buffer> {
  const ext = fileType.toLowerCase();
  if (!LIBREOFFICE_CONVERTIBLE.has(ext)) {
    throw new Error(`LibreOffice cannot convert .${ext} files`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "veil-convert-"));
  const inputPath = path.join(tmpDir, `input.${ext}`);

  try {
    await fs.writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      execFile(
        "libreoffice",
        [
          "--headless",
          "--norestore",
          "--convert-to", "pdf",
          "--outdir", tmpDir,
          inputPath,
        ],
        { timeout: 120_000 },
        (error, stdout, stderr) => {
          if (error) {
            logger.error("[redact-pdf] LibreOffice stderr:", { error: String(stderr) });
            reject(new Error(`LibreOffice conversion failed: ${error.message}`));
          } else {
            console.log("[redact-pdf] LibreOffice conversion:", stdout.trim());
            resolve();
          }
        },
      );
    });

    // LibreOffice outputs input.pdf in the same directory
    const outputPath = path.join(tmpDir, "input.pdf");
    const pdfBuffer = await fs.readFile(outputPath);
    return pdfBuffer;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Coordinate-mode dedup (Bug 6 fix, 2026-04-27)
// ---------------------------------------------------------------------------

/**
 * Coordinate-mode dedup mirrors `dedupeTextSearchRedactions` for the
 * spatial flavour of redaction. Pre-2026-04-27 the coord-mode path had
 * no dedup at any layer (neither here nor in `redact_by_coordinates`
 * inside `redact_pdf_pymupdf.py`), so every accepted Detection row
 * produced an independent `add_redact_annot` call. When two rows had
 * near-overlapping bboxes — e.g. a section-marker free-frank sentence
 * sharing left edge with an entity-propagation surname inside it —
 * PyMuPDF rendered each annotation's auto-fit citation independently,
 * producing the visible double-citation Eugene reported.
 *
 * The dedup runs in three phases over rows on the same page:
 *
 *   1. Exact-duplicate collapse — rows with identical bbox merge.
 *   2. Containment collapse — when bbox A contains bbox B
 *      (IOU > CONTAINMENT_IOU_THRESHOLD AND smaller.area < larger.area
 *      with the larger area also enclosing the smaller's bounds), they
 *      merge to a single rect with A's bbox.
 *   3. General overlap union — any remaining pair whose bboxes touch
 *      (IOU > 0) merges to the union rect of all members.
 *
 * Phases run transitively: A↔B and B↔C connection both contribute to
 * the same final group. Group survivor is the union of every member's
 * bbox; survivor ground is the most-restrictive across the group per
 * `GROUND_PRIORITY` below.
 */
const CONTAINMENT_IOU_THRESHOLD = 0.9;

/**
 * Most-restrictive-ground priority (lower index = more restrictive).
 * Order matches the LGOIMA-pathway hierarchy:
 *   - Section 6 (s6 a-d)            — conclusive grounds (must withhold).
 *   - Section 7(2)(g)                — legal professional privilege.
 *   - Section 7(2)(c)(i), (c)(ii)    — confidence grounds.
 *   - Section 7(2)(b)(i), (b)(ii)    — trade secrets / commercial.
 *   - Section 7(2)(h), (i)           — council commercial / negotiations.
 *   - Section 7(2)(f)(i), (f)(ii)    — free-frank / harassment-risk.
 *   - Section 7(2)(a)                — privacy of natural persons.
 *   - Section 17 (a-h)               — refusal grounds (lowest priority
 *                                      by default — these are usually
 *                                      whole-document refusals not
 *                                      per-bbox redactions).
 *
 * Tunable later if specific scenarios warrant adjustment. Grounds not
 * in the list fall through to the lowest priority (highest numeric
 * value).
 */
const GROUND_PRIORITY: ReadonlyArray<string> = [
  "s6a", "s6b", "s6c", "s6d",
  "s7_2g",
  "s7_2ci", "s7_2cii",
  "s7_2bi", "s7_2bii",
  "s7_2h", "s7_2i",
  "s7_2fi", "s7_2fii",
  "s7_2a",
  "s17a", "s17b", "s17ci", "s17cii", "s17d", "s17e", "s17f", "s17g", "s17h",
];

function groundPriority(groundId: string | null | undefined): number {
  if (!groundId) return Number.MAX_SAFE_INTEGER;
  const idx = GROUND_PRIORITY.indexOf(groundId);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

interface CoordinateBox {
  page: number;
  posX: number;
  posY: number;
  posW: number;
  posH: number;
}

interface CoordinateDetection extends CoordinateBox {
  appliedGround: string | null;
  suggestedGround: string | null;
}

interface CoordinateRedaction extends CoordinateBox {
  label: string;
}

/** Bbox area in (percentage)² — comparison only, the unit is irrelevant. */
function area(b: CoordinateBox): number {
  return b.posW * b.posH;
}

/** Intersection-over-Union for two same-page bboxes. */
function iou(a: CoordinateBox, b: CoordinateBox): number {
  if (a.page !== b.page) return 0;
  const ax2 = a.posX + a.posW;
  const ay2 = a.posY + a.posH;
  const bx2 = b.posX + b.posW;
  const by2 = b.posY + b.posH;
  const ix1 = Math.max(a.posX, b.posX);
  const iy1 = Math.max(a.posY, b.posY);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix1 >= ix2 || iy1 >= iy2) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Bbox A "contains" bbox B when A's rect fully encloses B's rect AND
 * the IOU clears the threshold. The strict-enclosure check guards
 * against the pathological case where two rects of similar area
 * overlap heavily without one being inside the other.
 */
function contains(larger: CoordinateBox, smaller: CoordinateBox): boolean {
  if (larger.page !== smaller.page) return false;
  if (area(larger) <= area(smaller)) return false;
  const enclosed =
    larger.posX <= smaller.posX &&
    larger.posY <= smaller.posY &&
    larger.posX + larger.posW >= smaller.posX + smaller.posW &&
    larger.posY + larger.posH >= smaller.posY + smaller.posH;
  if (!enclosed) return false;
  return iou(larger, smaller) > CONTAINMENT_IOU_THRESHOLD;
}

/** True when two bboxes share any pixel (touching counts as overlap). */
function overlaps(a: CoordinateBox, b: CoordinateBox): boolean {
  return iou(a, b) > 0;
}

/**
 * Union rect — smallest bbox covering both inputs.
 *
 * The output is rounded to 2 decimal places to match the precision
 * convention `calculateBBoxAll` uses elsewhere. Without rounding,
 * accumulated subtractions over a containment chain produce values
 * like 1.3400000000000034 from FP error — same final pixels, but
 * test assertions and downstream logs become noisy.
 */
function unionRect(a: CoordinateBox, b: CoordinateBox): CoordinateBox {
  const x1 = Math.min(a.posX, b.posX);
  const y1 = Math.min(a.posY, b.posY);
  const x2 = Math.max(a.posX + a.posW, b.posX + b.posW);
  const y2 = Math.max(a.posY + a.posH, b.posY + b.posH);
  return {
    page: a.page,
    posX: Math.round(x1 * 100) / 100,
    posY: Math.round(y1 * 100) / 100,
    posW: Math.round((x2 - x1) * 100) / 100,
    posH: Math.round((y2 - y1) * 100) / 100,
  };
}

/**
 * Deduplicate a coordinate-mode detection list by spatial grouping.
 *
 * Algorithm:
 *   - Build a graph where every detection on the same page is a node;
 *     edges connect rows whose bboxes overlap OR have a containment
 *     relationship.
 *   - Compute connected components via union-find.
 *   - For each component, emit one redaction entry. Bbox is the union
 *     of all members. Ground is the most-restrictive label across all
 *     members (per GROUND_PRIORITY).
 *
 * Output is stable in input order — the first member of each
 * connected component dictates the output position. Rows on different
 * pages never connect, so the algorithm scales linearly per page.
 */
export function dedupeCoordinateRedactions(
  detections: CoordinateDetection[],
): CoordinateRedaction[] {
  if (detections.length === 0) return [];

  // Union-find over indices.
  const parent = detections.map((_, i) => i);
  function find(i: number): number {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let curr = i;
    while (parent[curr] !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  }
  function unite(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  // Build edges. O(n²) per page is fine — accepted-detection lists
  // are typically dozens, not thousands. If a fixture grows large we
  // can re-bucket by page first to keep the constant factor down.
  for (let i = 0; i < detections.length; i++) {
    for (let j = i + 1; j < detections.length; j++) {
      const a = detections[i];
      const b = detections[j];
      if (a.page !== b.page) continue;
      // Containment check covers exact-duplicate as a degenerate case
      // (IOU=1.0 ≥ 0.9; enclosed is true on identical rects when the
      // strict-larger-area guard would skip them — but identical rects
      // have equal area so contains() returns false and the overlaps()
      // check below catches them via IOU=1).
      if (overlaps(a, b) || contains(a, b) || contains(b, a)) {
        unite(i, j);
      }
    }
  }

  // Group members by root.
  const groupsByRoot = new Map<number, number[]>();
  for (let i = 0; i < detections.length; i++) {
    const root = find(i);
    const list = groupsByRoot.get(root);
    if (list) list.push(i);
    else groupsByRoot.set(root, [i]);
  }

  // Emit one redaction per group, preserving the position of the
  // first member encountered in the input order.
  const seenRoots = new Set<number>();
  const out: CoordinateRedaction[] = [];
  for (let i = 0; i < detections.length; i++) {
    const root = find(i);
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);

    const members = groupsByRoot.get(root)!;

    // Bbox: union of all members.
    let bbox: CoordinateBox = detections[members[0]];
    for (let k = 1; k < members.length; k++) {
      bbox = unionRect(bbox, detections[members[k]]);
    }

    // Ground: most-restrictive across members (lowest priority index).
    // The effective ground for a detection is `appliedGround` when set
    // (the reviewer's chosen ground) and falls back to `suggestedGround`
    // otherwise. We do NOT consider both fields per detection — when
    // the reviewer accepts with a specific ground that's the
    // authoritative answer, even if `suggestedGround` is more
    // restrictive. (Pre-2026-04-27 the loop iterated both fields per
    // member and the AI's `suggestedGround` could quietly override the
    // reviewer's `appliedGround` choice during dedup.)
    let bestPriority = Number.MAX_SAFE_INTEGER;
    let bestGround: string | null = null;
    for (const idx of members) {
      const det = detections[idx];
      const effective = det.appliedGround ?? det.suggestedGround;
      if (!effective) continue;
      const p = groundPriority(effective);
      if (p < bestPriority) {
        bestPriority = p;
        bestGround = effective;
      }
    }

    const ground = bestGround ? getGroundById(bestGround) : null;
    out.push({
      page: bbox.page,
      posX: bbox.posX,
      posY: bbox.posY,
      posW: bbox.posW,
      posH: bbox.posH,
      label: ground ? ground.reference : (bestGround || ""),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Text-search dedup + filter (exported for testing)
// ---------------------------------------------------------------------------

/** Max text length for text-search redaction. Detections longer than this are
 *  AI-generated contextual summaries, not literal document text. */
export const TEXT_SEARCH_MAX_LENGTH = 80;

interface TextSearchDetection {
  text: string;
  page: number;
  appliedGround: string | null;
  suggestedGround: string | null;
}

interface TextSearchRedaction {
  page: number;
  text: string;
  label: string;
}

/**
 * Deduplicate by (page, text) and filter out long AI-summary detections
 * that aren't literal document text. Returns the filtered redaction entries.
 *
 * `options.skipLongTextGuard` (default false) bypasses the 80-char
 * filter — used by the Tier 1+2 chain in `redactCanonicalPdf` for the
 * zero-bbox detection subset. The 80-char guard exists to short-circuit
 * AI paraphrase summaries on the standalone Tier 2 path; the chain
 * pass however is the only path that can redact long zero-bbox rows
 * at all, so the filter would no-op the chain. PyMuPDF's text search
 * silently fails on misses, so feeding long text through is safe — at
 * worst nothing matches; at best the literal sentence is redacted.
 */
export function dedupeTextSearchRedactions(
  detections: TextSearchDetection[],
  options?: { skipLongTextGuard?: boolean },
): TextSearchRedaction[] {
  const seen = new Set<string>();
  const redactions: TextSearchRedaction[] = [];
  const skipLongTextGuard = options?.skipLongTextGuard === true;
  for (const det of detections) {
    if (!skipLongTextGuard && det.text.length > TEXT_SEARCH_MAX_LENGTH) continue;

    const key = `${det.page}|${det.text}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const groundId = det.appliedGround || det.suggestedGround;
    const ground = groundId ? getGroundById(groundId) : null;
    redactions.push({
      page: det.page,
      text: det.text,
      label: ground ? ground.reference : (groundId || ""),
    });
  }
  return redactions;
}

// ---------------------------------------------------------------------------
// Non-PDF originals — text-search redaction via PyMuPDF
// ---------------------------------------------------------------------------

/**
 * Redact a PDF using text-search mode in PyMuPDF.
 *
 * Instead of coordinate-based bounding boxes, this passes detection text
 * strings to the Python script which uses page.search_for() to locate
 * each string and apply true redaction at the found positions.
 */
async function redactByTextSearch(
  pdfBuffer: Buffer,
  detections: TextSearchDetection[],
  options?: { skipLongTextGuard?: boolean },
): Promise<RedactedResult> {
  const before = detections.length;
  const redactions = dedupeTextSearchRedactions(detections, options);
  console.log(`[redact-pdf] Deduped: ${before} → ${redactions.length} redaction entries`);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "veil-redact-ts-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.pdf");
  const jsonPath = path.join(tmpDir, "redactions.json");
  const scriptPath = path.resolve(process.cwd(), "lib/pipeline/redact_pdf_pymupdf.py");

  try {
    await fs.writeFile(inputPath, pdfBuffer);
    await fs.writeFile(jsonPath, JSON.stringify(redactions));

    await new Promise<void>((resolve, reject) => {
      execFile(
        "python3",
        [scriptPath, inputPath, outputPath, jsonPath, "--mode=text-search"],
        { timeout: 120_000 },
        (error, stdout, stderr) => {
          if (error) {
            logger.error("[redact-pdf] PyMuPDF text-search stderr:", { error: String(stderr) });
            reject(new Error(`PyMuPDF text-search redaction failed: ${error.message}`));
          } else {
            console.log("[redact-pdf] PyMuPDF text-search result:", stdout.trim());
            resolve();
          }
        },
      );
    });

    const pdfBytes = await fs.readFile(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    return {
      pdfBytes: new Uint8Array(pdfBytes),
      redactionCount: detections.length,
      pageCount,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Fallback — generate text-based PDF with redactions (Tier 3)
// ---------------------------------------------------------------------------

async function generateTextPdf(
  doc: { id: string },
  detections: Array<{
    text: string;
    appliedGround: string | null;
    suggestedGround: string | null;
    page: number;
  }>,
): Promise<RedactedResult> {
  // Fetch extracted pages
  const docPages = await prisma.documentPage.findMany({
    where: { documentId: doc.id },
    orderBy: { pageNumber: "asc" },
  });

  const pdfDoc = await PDFDocument.create();
  const { regular: font, bold: boldFont } = await embedFonts(pdfDoc);
  const fontSize = 10;
  const lineHeight = 14;
  const margin = 50;
  const pageWidth = 595; // A4
  const pageHeight = 842;
  const maxLineWidth = pageWidth - 2 * margin;

  // Build a set of texts to redact per page
  const redactMap = new Map<number, Set<string>>();
  const groundMap = new Map<string, string>();
  for (const det of detections) {
    if (!redactMap.has(det.page)) redactMap.set(det.page, new Set());
    redactMap.get(det.page)!.add(det.text);
    const groundId = det.appliedGround || det.suggestedGround;
    if (groundId) {
      const ground = getGroundById(groundId);
      groundMap.set(det.text, ground ? ground.reference : groundId);
    }
  }

  for (const docPage of docPages) {
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPos = pageHeight - margin;

    // Page header
    page.drawText(`Page ${docPage.pageNumber}`, {
      x: margin,
      y: yPos,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    yPos -= lineHeight * 1.5;

    const pageRedactions = redactMap.get(docPage.pageNumber) || new Set();
    const text = docPage.text;
    const lines = text.split("\n");

    for (const line of lines) {
      if (yPos < margin + lineHeight) {
        // New PDF page
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - margin;
      }

      // Check if any detection text is found in this line
      let processedLine = line;
      for (const redactText of pageRedactions) {
        if (processedLine.includes(redactText)) {
          const groundRef = groundMap.get(redactText) || "";
          const replacement = `[REDACTED${groundRef ? ` ${groundRef}` : ""}]`;
          processedLine = processedLine.replace(redactText, replacement);
        }
      }

      // Word-wrap
      const words = processedLine.split(" ");
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, fontSize);
        if (textWidth > maxLineWidth && currentLine) {
          page.drawText(currentLine, {
            x: margin,
            y: yPos,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
          yPos -= lineHeight;
          currentLine = word;

          if (yPos < margin + lineHeight) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            yPos = pageHeight - margin;
          }
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        page.drawText(currentLine, {
          x: margin,
          y: yPos,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        yPos -= lineHeight;
      }
    }
  }

  // Metadata
  pdfDoc.setCreator("Veil LGOIMA Disclosure Platform");
  pdfDoc.setProducer("Veil by DataSing");

  const pdfBytes = await pdfDoc.save();

  return {
    pdfBytes,
    redactionCount: detections.length,
    pageCount: pdfDoc.getPageCount(),
  };
}
