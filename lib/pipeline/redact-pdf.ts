/**
 * Redaction engine — applies permanent redaction to PDF documents.
 *
 * For PDF originals: calls PyMuPDF (via Python subprocess) which uses
 * add_redact_annot + apply_redactions to genuinely remove text from
 * the PDF content stream. This is true, defensible redaction.
 *
 * For non-PDF originals: generates a new text-based PDF with redaction
 * markers applied (original text never enters the output).
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { getGroundById } from "@/lib/lgoima-grounds";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

interface RedactedResult {
  pdfBytes: Uint8Array;
  redactionCount: number;
  pageCount: number;
}

/**
 * Build a redacted PDF for a document.
 *
 * For PDF originals: load the original, draw black boxes over accepted
 * detections at their bounding-box positions, overlay the ground reference
 * in white text.
 *
 * For non-PDF originals (DOCX, XLSX, TXT, EML, etc.): generate a new
 * text-based PDF from extracted pages with redaction markers applied.
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

  if (isPdf) {
    try {
      return await redactOriginalPdf(doc, acceptedDetections);
    } catch (err) {
      console.warn(
        `[redact-pdf] PyMuPDF redaction failed for ${doc.id}, falling back to text PDF:`,
        err instanceof Error ? err.message : err,
      );
      // Fall through to text-based PDF as a safety net
      return generateTextPdf(doc, acceptedDetections);
    }
  }
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
            console.error("[redact-pdf] PyMuPDF stderr:", stderr);
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
// Non-PDF originals — generate text-based PDF with redactions
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
          const replacement = `[${"█".repeat(Math.min(redactText.length, 20))} ${groundRef}]`;
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
