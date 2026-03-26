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

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
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
const LIBREOFFICE_CONVERTIBLE = new Set([
  "docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp",
  "rtf", "txt", "csv", "html", "htm",
]);

/**
 * Build a redacted PDF for a document.
 *
 * Three-tier fallback:
 *   1. Coordinate-based PyMuPDF (PDFs with bounding boxes)
 *   2. LibreOffice conversion + text-search PyMuPDF (non-PDFs)
 *   3. Plain text PDF generation (last resort)
 */
export async function buildRedactedPdf(documentId: string): Promise<RedactedResult> {
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
  doc: { id: string; caseId: string; originalPath: string | null },
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

  // Prepare redaction data for the Python script
  const redactions = detections.map((det) => {
    const groundId = det.appliedGround || det.suggestedGround;
    const ground = groundId ? getGroundById(groundId) : null;
    return {
      page: det.page,
      posX: det.posX,
      posY: det.posY,
      posW: det.posW,
      posH: det.posH,
      label: ground ? ground.reference : (groundId || ""),
    };
  });

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
async function convertToPdfWithLibreOffice(
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

/**
 * Redact a PDF using text-search mode in PyMuPDF.
 *
 * Instead of coordinate-based bounding boxes, this passes detection text
 * strings to the Python script which uses page.search_for() to locate
 * each string and apply true redaction at the found positions.
 */
async function redactByTextSearch(
  pdfBuffer: Buffer,
  detections: Array<{
    text: string;
    appliedGround: string | null;
    suggestedGround: string | null;
    page: number;
  }>,
): Promise<RedactedResult> {
  const redactions = detections.map((det) => {
    const groundId = det.appliedGround || det.suggestedGround;
    const ground = groundId ? getGroundById(groundId) : null;
    return {
      page: det.page,
      text: det.text,
      label: ground ? ground.reference : (groundId || ""),
    };
  });

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
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
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
