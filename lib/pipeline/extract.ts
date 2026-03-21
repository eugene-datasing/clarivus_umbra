/**
 * Text extraction module for the Veil document processing pipeline.
 *
 * Supports:
 * - PDF and images via Azure Document Intelligence (prebuilt-read)
 * - DOCX via mammoth
 * - XLSX via xlsx
 * - EML via mailparser (RFC822 email)
 * - MSG via @kenjiuno/msgreader (Outlook binary format)
 * - TXT via plain UTF-8 decode
 */

import {
  DocumentAnalysisClient,
  AzureKeyCredential,
} from "@azure/ai-form-recognizer";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { simpleParser } from "mailparser";
import {
  resilientDocIntelCall,
  CircuitOpenError,
} from "@/lib/resilience/azure-services";
import { extractMsg, emailContentToExtractionResult } from "./email-extract";
import {
  extractFromAudio,
  extractFromVideo,
  extractFromImageRegions,
} from "./multimedia-extract";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "extract" });

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

export interface ExtractionAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
  size: number;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  totalText: string;
  attachments?: ExtractionAttachment[];
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

  const result = await resilientDocIntelCall(async () => {
    const poller = await client.beginAnalyzeDocument("prebuilt-read", buffer);
    return poller.pollUntilDone();
  });

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

/**
 * Extract email content using mailparser.
 * Page 1: email headers (from, to, cc, date, subject)
 * Page 2: plain text body
 * Page 3: HTML body stripped to text (if distinct from plain text)
 * Attachments are returned separately for child-document processing.
 */
async function extractFromEmail(buffer: Buffer): Promise<ExtractionResult> {
  const parsed = await simpleParser(buffer);

  const pages: ExtractedPage[] = [];
  const textParts: string[] = [];

  // Page 1: Headers
  const headers: string[] = [];
  if (parsed.from?.text) headers.push(`From: ${parsed.from.text}`);
  if (parsed.to) {
    const toText = Array.isArray(parsed.to)
      ? parsed.to.map((a) => a.text).join(", ")
      : parsed.to.text;
    headers.push(`To: ${toText}`);
  }
  if (parsed.cc) {
    const ccText = Array.isArray(parsed.cc)
      ? parsed.cc.map((a) => a.text).join(", ")
      : parsed.cc.text;
    headers.push(`CC: ${ccText}`);
  }
  if (parsed.date) headers.push(`Date: ${parsed.date.toISOString()}`);
  if (parsed.subject) headers.push(`Subject: ${parsed.subject}`);
  if (parsed.messageId) headers.push(`Message-ID: ${parsed.messageId}`);

  const headerText = headers.join("\n");
  pages.push({ pageNumber: 1, text: `[Email Headers]\n${headerText}` });
  textParts.push(headerText);

  // Page 2: Plain text body
  if (parsed.text) {
    pages.push({ pageNumber: 2, text: parsed.text });
    textParts.push(parsed.text);
  }

  // Page 3: HTML body (converted to text) if meaningfully different
  if (parsed.html && !parsed.text) {
    // Strip HTML tags for a plain-text approximation
    const stripped = parsed.html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
    if (stripped.length > 0) {
      pages.push({ pageNumber: pages.length + 1, text: stripped });
      textParts.push(stripped);
    }
  }

  // If no body content at all, create a stub page
  if (pages.length === 1) {
    pages.push({ pageNumber: 2, text: "(No message body)" });
  }

  // Collect attachments
  const attachments: ExtractionAttachment[] = [];
  if (parsed.attachments) {
    for (const att of parsed.attachments) {
      if (att.content && att.filename) {
        attachments.push({
          filename: att.filename,
          contentType: att.contentType || "application/octet-stream",
          content: Buffer.from(att.content),
          size: att.size,
        });
      }
    }
  }

  const totalText = textParts.join("\n\n");
  return { pages, totalText, attachments: attachments.length > 0 ? attachments : undefined };
}

/**
 * Extract email content from an Outlook MSG (binary) file.
 * Uses @kenjiuno/msgreader to parse the Compound File Binary Format,
 * then converts the structured email data to pipeline pages.
 * Attachments are returned separately for child-document processing.
 */
async function extractFromMsgFile(buffer: Buffer): Promise<ExtractionResult> {
  const emailContent = extractMsg(buffer);
  return emailContentToExtractionResult(emailContent);
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
      try {
        return await extractFromPdf(buffer);
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          // PDFs and images have no text-based fallback -- propagate as a
          // service-unavailability error so the pipeline can set the document
          // to "error" status with a clear message.
          throw new OCRUnavailableError(ft);
        }
        // Classify PDF/image extraction errors for better user messaging
        const msg = error instanceof Error ? error.message : String(error);
        log.error("PDF/image extraction failed", { fileType: ft, error: msg });
        if (msg.includes("Invalid PDF") || msg.includes("invalid pdf")) {
          throw new ExtractionCorruptionError(
            `The ${ft} file is invalid and could not be parsed. It may be corrupted, truncated, or not a genuine ${ft} file.`,
          );
        }
        if (msg.includes("password") || msg.includes("encrypted")) {
          throw new ExtractionCorruptionError(
            `The ${ft} file is password-protected or encrypted. Please remove the password protection and re-upload.`,
          );
        }
        if (msg.includes("corrupted") || msg.includes("corrupt")) {
          throw new ExtractionCorruptionError(
            `The ${ft} file appears to be corrupted and cannot be read. Please try re-exporting or re-saving the original file.`,
          );
        }
        throw error;
      }

    case "DOCX":
      try {
        return await extractFromDocx(buffer);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("DOCX extraction failed", { error: msg });
        if (msg.includes("Could not find file") || msg.includes("corrupt") || msg.includes("End of data")) {
          throw new ExtractionCorruptionError(
            "The DOCX file is corrupted or has an invalid internal structure. Please try re-saving the document in Microsoft Word and re-uploading.",
          );
        }
        if (msg.includes("password") || msg.includes("encrypted")) {
          throw new ExtractionCorruptionError(
            "The DOCX file is password-protected. Please remove the password protection and re-upload.",
          );
        }
        throw error;
      }

    case "XLSX":
      try {
        return await extractFromXlsx(buffer);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("XLSX extraction failed", { error: msg });
        if (msg.includes("cfb") || msg.includes("corrupt") || msg.includes("invalid") || msg.includes("Unexpected")) {
          throw new ExtractionCorruptionError(
            "The XLSX file is corrupted or has an invalid internal structure. Please try re-saving the spreadsheet in Microsoft Excel and re-uploading.",
          );
        }
        if (msg.includes("password") || msg.includes("encrypted")) {
          throw new ExtractionCorruptionError(
            "The XLSX file is password-protected. Please remove the password protection and re-upload.",
          );
        }
        throw error;
      }

    case "EML":
      try {
        return await extractFromEmail(buffer);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("EML extraction failed", { error: msg });
        throw new ExtractionCorruptionError(
          `The EML file could not be parsed. It may be corrupted or in an unsupported encoding. Details: ${msg.slice(0, 200)}`,
        );
      }

    case "MSG":
      try {
        return await extractFromMsgFile(buffer);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("MSG extraction failed", { error: msg });
        throw new ExtractionCorruptionError(
          `The MSG file could not be parsed. It may be corrupted or in an unsupported format. Details: ${msg.slice(0, 200)}`,
        );
      }

    case "TXT":
      return extractFromText(buffer);

    // Audio formats — delegate to multimedia extractor
    case "MP3":
    case "WAV":
    case "M4A": {
      const audioResult = await extractFromAudio(buffer, fileType);
      return {
        pages: audioResult.pages,
        totalText: audioResult.totalText,
        attachments: audioResult.attachments,
      };
    }

    // Video formats — delegate to multimedia extractor
    case "MP4":
    case "MOV":
    case "AVI":
    case "WEBM": {
      const videoResult = await extractFromVideo(buffer, fileType);
      return {
        pages: videoResult.pages,
        totalText: videoResult.totalText,
        attachments: videoResult.attachments,
      };
    }

    case "PST":
      throw new Error(
        "PST archives are not supported. Please export individual emails as EML or MSG files before uploading.",
      );

    default:
      throw new Error(`Unsupported file type for text extraction: ${fileType}`);
  }
}

// ---------------------------------------------------------------------------
// Custom error for extraction-time corruption detection
// ---------------------------------------------------------------------------

/**
 * Thrown when a file that passed initial upload validation fails during
 * content extraction due to corruption, password protection, or structural
 * issues detected by the extraction library.
 */
export class ExtractionCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionCorruptionError";
  }
}

// ---------------------------------------------------------------------------
// Custom error for OCR service unavailability
// ---------------------------------------------------------------------------

/**
 * Thrown when Document Intelligence is unavailable (circuit open) and the
 * file type requires OCR (e.g. PDF, image).  Text-based formats (DOCX, EML)
 * do not need OCR and are handled by their own extractors.
 */
export class OCRUnavailableError extends Error {
  constructor(fileType: string) {
    super(
      `OCR service temporarily unavailable (circuit open). Cannot process ${fileType} file without Document Intelligence.`,
    );
    this.name = "OCRUnavailableError";
  }
}
