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
