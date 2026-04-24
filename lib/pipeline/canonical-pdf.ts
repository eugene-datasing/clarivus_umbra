/**
 * Canonical PDF builder — produces a single "canonical" PDF per document for
 * the viewer rework (Phase 1, April 2026). The canonical PDF is what the
 * reviewer sees, what the redactor operates against, and what the approver
 * certifies. See docs/viewer-rework-plan-2026-04.md Phase 1 for design.
 *
 * Dispatch by fileType:
 *   - pdf                         → pass-through, canonical = original buffer
 *   - LIBREOFFICE_CONVERTIBLE set → LibreOffice headless convert to PDF
 *   - eml / msg                   → renderEmailAsPdf (Step 5 implementation)
 *   - anything else               → throws
 *
 * This module is pure dispatch + hashing + page counting. It does NOT touch
 * storage or the database — callers (process.ts, admin rebuild route,
 * backfill script) are responsible for persisting the returned PDF and
 * writing the returned metadata to Document columns.
 */

import { createHash } from "crypto";
import { PDFDocument } from "pdf-lib";
import { LIBREOFFICE_CONVERTIBLE, convertToPdfWithLibreOffice } from "./redact-pdf";
import { renderEmailAsPdf } from "./email-to-pdf";

export type CanonicalPdfSource = "original" | "libreoffice" | "email-template";

export interface CanonicalPdfResult {
  pdfBuffer: Buffer;
  source: CanonicalPdfSource;
  pageCount: number;
  sha256: string;
  durationMs: number;
}

export interface CanonicalPdfDocument {
  id: string;
  fileType: string;
}

const EMAIL_EXTENSIONS = new Set(["eml", "msg"]);

/**
 * Fast check for whether a fileType is in the canonical-PDF supported set,
 * without attempting to build. Callers (process.ts, admin rebuild endpoint,
 * backfill script) use this to skip gracefully for images, audio, video —
 * types that have no viewer rework story and keep legacy pipeline behaviour.
 */
export function isCanonicalPdfSupported(fileType: string): boolean {
  const ext = fileType.toLowerCase();
  return ext === "pdf" || EMAIL_EXTENSIONS.has(ext) || LIBREOFFICE_CONVERTIBLE.has(ext);
}

export async function buildCanonicalPdf(
  doc: CanonicalPdfDocument,
  originalBuffer: Buffer,
): Promise<CanonicalPdfResult> {
  const start = Date.now();
  const ext = doc.fileType.toLowerCase();

  let pdfBuffer: Buffer;
  let source: CanonicalPdfSource;

  if (ext === "pdf") {
    pdfBuffer = originalBuffer;
    source = "original";
  } else if (EMAIL_EXTENSIONS.has(ext)) {
    pdfBuffer = await renderEmailAsPdf(originalBuffer, ext);
    source = "email-template";
  } else if (LIBREOFFICE_CONVERTIBLE.has(ext)) {
    pdfBuffer = await convertToPdfWithLibreOffice(originalBuffer, ext);
    source = "libreoffice";
  } else {
    const supported = ["pdf", ...Array.from(LIBREOFFICE_CONVERTIBLE), "eml", "msg"];
    throw new Error(
      `buildCanonicalPdf: unsupported fileType ".${ext}" for document ${doc.id}. ` +
        `Supported: ${supported.join(", ")}.`,
    );
  }

  const pageCount = await countPages(pdfBuffer);
  const sha256 = createHash("sha256").update(pdfBuffer).digest("hex");
  const durationMs = Date.now() - start;

  return { pdfBuffer, source, pageCount, sha256, durationMs };
}

async function countPages(pdfBuffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}

/**
 * Probe whether a canonical PDF has a meaningful text layer.
 *
 * Phase 3 of the viewer rework re-implements manual detection against
 * pdf.js's text layer; documents whose canonical PDF is image-only
 * (scanned PDFs, rasterised forms) have an empty text layer and cannot
 * support text selection. This probe runs at ingest time and during
 * backfill so the reviewer-side render path can route text-less
 * documents to the HTML fallback view (Option C in the 2026-04-24
 * text-selection spike report).
 *
 * Threshold: 50 characters total across all pages. Rationale: a
 * fully-text-less PDF returns 0; a mostly-image-with-a-cover-page PDF
 * returns small numbers but typically passes 50 if the cover has any
 * body text. The threshold is deliberately permissive — false-positive
 * "text-selectable" on a marginal document means the reviewer attempts
 * a selection, gets no useful text, and falls back to the existing
 * sidebar Accept/Reject flow which still works regardless. False
 * negatives (calling a real document text-less) are the worse failure
 * because they unnecessarily fall back to the HTML view.
 *
 * Pure function over a buffer: no I/O, no DB. Callers pass the
 * canonical PDF bytes directly.
 */
export async function isTextSelectable(canonicalPdfBuffer: Buffer): Promise<boolean> {
  // pdfjs-dist is loaded lazily so the module's import surface stays
  // small for callers that only need the canonical-build path.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(canonicalPdfBuffer);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const THRESHOLD = 50;
  let total = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const item of tc.items as Array<{ str: string }>) {
      total += item.str.length;
      if (total > THRESHOLD) return true; // short-circuit
    }
  }
  return false;
}
