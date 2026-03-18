/**
 * Text extraction module for the Veil document processing pipeline.
 *
 * Supports:
 * - PDF and images via Azure Document Intelligence (prebuilt-read)
 * - DOCX via mammoth
 * - XLSX via xlsx
 * - TXT / EML via plain UTF-8 decode
 */

import {
  DocumentAnalysisClient,
  AzureKeyCredential,
} from "@azure/ai-form-recognizer";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  width?: number;
  height?: number;
  words?: Array<{ text: string; confidence: number; polygon?: number[] }>;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  totalText: string;
}

// ---------------------------------------------------------------------------
// Azure Document Intelligence client (lazy singleton)
// ---------------------------------------------------------------------------

let _diClient: DocumentAnalysisClient | null = null;

function getDIClient(): DocumentAnalysisClient {
  if (_diClient) return _diClient;

  const endpoint = process.env.AZURE_DI_ENDPOINT;
  const key = process.env.AZURE_DI_KEY;

  if (!endpoint || !key) {
    throw new Error(
      "Azure Document Intelligence credentials missing. Set AZURE_DI_ENDPOINT and AZURE_DI_KEY.",
    );
  }

  _diClient = new DocumentAnalysisClient(
    endpoint,
    new AzureKeyCredential(key),
  );
  return _diClient;
}

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF or image using Azure Document Intelligence
 * (prebuilt-read model).  Returns per-page text, dimensions and word data.
 */
async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  const client = getDIClient();

  const poller = await client.beginAnalyzeDocument("prebuilt-read", buffer);
  const result = await poller.pollUntilDone();

  const pages: ExtractedPage[] = [];

  if (result.pages) {
    for (const page of result.pages) {
      // Build page text from lines (preserves reading order)
      const lines: string[] = [];
      if (page.lines) {
        for (const line of page.lines) {
          lines.push(line.content);
        }
      }

      // Collect word-level data for potential future use
      const words: ExtractedPage["words"] = [];
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

      pages.push({
        pageNumber: page.pageNumber,
        text: lines.join("\n"),
        width: page.width,
        height: page.height,
        words,
      });
    }
  }

  const totalText = pages.map((p) => p.text).join("\n\n");
  return { pages, totalText };
}

/**
 * Extract raw text from a DOCX file using mammoth.
 * Returns a single "page" since DOCX has no inherent page structure.
 */
async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value || "";

  const pages: ExtractedPage[] = [
    {
      pageNumber: 1,
      text,
    },
  ];

  return { pages, totalText: text };
}

/**
 * Extract text from an XLSX workbook.
 * Each worksheet becomes a separate "page".
 */
async function extractFromXlsx(buffer: Buffer): Promise<ExtractionResult> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const pages: ExtractedPage[] = [];

  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const sheetName = workbook.SheetNames[i];
    const worksheet = workbook.Sheets[sheetName];

    // Convert sheet to CSV-like text for downstream analysis
    const text = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });

    pages.push({
      pageNumber: i + 1,
      text: `[Sheet: ${sheetName}]\n${text}`,
    });
  }

  const totalText = pages.map((p) => p.text).join("\n\n");
  return { pages, totalText };
}

/**
 * Plain-text / EML extraction: decode buffer as UTF-8.
 */
async function extractFromText(buffer: Buffer): Promise<ExtractionResult> {
  const text = buffer.toString("utf-8");

  const pages: ExtractedPage[] = [
    {
      pageNumber: 1,
      text,
    },
  ];

  return { pages, totalText: text };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Extract text from a document buffer based on its file type.
 *
 * @param buffer - raw file bytes
 * @param fileType - upper-case file type label (e.g. "PDF", "DOCX", "Image")
 */
export async function extractText(
  buffer: Buffer,
  fileType: string,
): Promise<ExtractionResult> {
  const ft = fileType.toUpperCase();

  switch (ft) {
    case "PDF":
    case "IMAGE":
    case "PNG":
    case "JPG":
    case "JPEG":
    case "TIFF":
    case "BMP":
      return extractFromPdf(buffer);

    case "DOCX":
      return extractFromDocx(buffer);

    case "XLSX":
      return extractFromXlsx(buffer);

    case "TXT":
    case "EML":
    case "MSG":
      return extractFromText(buffer);

    default:
      throw new Error(`Unsupported file type for text extraction: ${fileType}`);
  }
}
