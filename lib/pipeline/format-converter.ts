/**
 * Document format conversion module for the Umbra processing pipeline.
 *
 * Converts any supported document format into a standardized review format,
 * producing structured ContentBlocks that provide a consistent view for
 * the review UI regardless of the original file format.
 *
 * Supported conversions:
 * - DOCX: structured HTML extraction via mammoth, parsed into ContentBlocks
 * - XLSX: each sheet becomes a table ContentBlock with row/column structure
 * - EML/MSG: structured blocks for headers, body, and attachment lists
 * - PDF: pages from OCR text, split into paragraph blocks
 * - TXT: split into paragraph blocks
 * - Audio/Video: transcript segments as paragraph blocks
 */

import mammoth from "mammoth";
import ExcelJS from "exceljs";
import type { ExtractedPage } from "./extract";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "format-converter" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A structured block of content in the review format. */
export interface ContentBlock {
  /** The type of content block */
  type:
    | "heading"
    | "paragraph"
    | "table"
    | "list"
    | "image-placeholder"
    | "metadata";
  /** The text or structured content */
  content: string;
  /** Heading level (1-6) for "heading" type blocks */
  level?: number;
}

/** A single page in the review format. */
export interface ReviewPage {
  /** 1-based page number */
  pageNumber: number;
  /** Plain text content of the page */
  text: string;
  /** HTML content (if available from DOCX conversion) */
  htmlContent?: string;
  /** Structured content blocks for rendering */
  structuredContent: ContentBlock[];
}

/** Result of a format conversion operation. */
export interface ConversionResult {
  /** Converted pages in the review format */
  pages: ReviewPage[];
  /** Original file format (e.g. "DOCX", "XLSX", "PDF") */
  originalFormat: string;
  /** Target format after conversion */
  convertedFormat: string;
  /** Notes about the conversion process (warnings, skipped content, etc.) */
  conversionNotes: string[];
}

// ---------------------------------------------------------------------------
// Main conversion function
// ---------------------------------------------------------------------------

/**
 * Convert a document buffer to the standardized review format.
 *
 * This function examines the file type and dispatches to the appropriate
 * converter. The result includes structured ContentBlocks that can be
 * rendered consistently in the review UI.
 *
 * @param buffer - Raw file bytes
 * @param fileType - Upper-case file type label (e.g. "PDF", "DOCX")
 * @param filename - Original filename
 * @returns ConversionResult with structured pages
 */
export async function convertToReviewFormat(
  buffer: Buffer,
  fileType: string,
  filename: string,
): Promise<ConversionResult> {
  const ft = fileType.toUpperCase();

  log.info("Starting format conversion", { filename, fileType: ft });

  try {
    switch (ft) {
      case "DOCX":
        return await convertDocx(buffer, filename);

      case "XLSX":
        return await convertXlsx(buffer, filename);

      case "EML":
      case "MSG":
        return convertEmailPlaceholder(ft, filename);

      case "PDF":
      case "IMAGE":
      case "PNG":
      case "JPG":
      case "JPEG":
      case "TIFF":
      case "BMP":
        return convertPdfPlaceholder(ft, filename);

      case "TXT":
        return convertText(buffer, filename);

      case "MP3":
      case "WAV":
      case "M4A":
      case "MP4":
      case "MOV":
      case "AVI":
      case "WEBM":
        return convertMultimediaPlaceholder(ft, filename);

      default:
        log.warn("No specific converter for file type, using text fallback", {
          fileType: ft,
          filename,
        });
        return convertText(buffer, filename);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Format conversion failed", { filename, fileType: ft, error: msg });

    return {
      pages: [],
      originalFormat: ft,
      convertedFormat: "review",
      conversionNotes: [
        "Format conversion failed: " + msg + ". Using raw extracted text instead.",
      ],
    };
  }
}

/**
 * Convert extracted pages (from any source) into a ConversionResult
 * with structured ContentBlocks.
 *
 * This is the post-extraction conversion path used by process.ts after
 * text has already been extracted. It enriches the raw page text with
 * structural analysis (heading detection, paragraph splitting, etc.).
 *
 * @param pages - Extracted pages from the extraction step
 * @param fileType - File type label
 * @param filename - Original filename
 * @returns ConversionResult with structured content
 */
export function convertFromPages(
  pages: ExtractedPage[],
  fileType: string,
  filename: string,
): ConversionResult {
  const notes: string[] = [];
  const reviewPages: ReviewPage[] = [];

  for (const page of pages) {
    const blocks = textToContentBlocks(page.text);

    reviewPages.push({
      pageNumber: page.pageNumber,
      text: page.text,
      structuredContent: blocks,
    });
  }

  log.info("Converted extracted pages to review format", {
    filename,
    fileType,
    pages: reviewPages.length,
    totalBlocks: reviewPages.reduce(
      (sum, p) => sum + p.structuredContent.length,
      0,
    ),
  });

  return {
    pages: reviewPages,
    originalFormat: fileType.toUpperCase(),
    convertedFormat: "review",
    conversionNotes: notes,
  };
}

// ---------------------------------------------------------------------------
// DOCX conversion
// ---------------------------------------------------------------------------

/**
 * Convert a DOCX file to the review format using mammoth for HTML extraction,
 * then parse the HTML into structured ContentBlocks.
 */
async function convertDocx(
  buffer: Buffer,
  filename: string,
): Promise<ConversionResult> {
  const notes: string[] = [];

  const htmlResult = await mammoth.convertToHtml({ buffer });
  const html = htmlResult.value || "";

  if (htmlResult.messages && htmlResult.messages.length > 0) {
    for (const msg of htmlResult.messages) {
      notes.push("mammoth: " + msg.message);
    }
  }

  const textResult = await mammoth.extractRawText({ buffer });
  const rawText = textResult.value || "";

  const blocks = htmlToContentBlocks(html);

  const reviewPages: ReviewPage[] = [
    {
      pageNumber: 1,
      text: rawText,
      htmlContent: html,
      structuredContent: blocks,
    },
  ];

  log.info("DOCX conversion complete", {
    filename,
    blocks: blocks.length,
    htmlLength: html.length,
    notes: notes.length,
  });

  return {
    pages: reviewPages,
    originalFormat: "DOCX",
    convertedFormat: "review",
    conversionNotes: notes,
  };
}

// ---------------------------------------------------------------------------
// XLSX conversion
// ---------------------------------------------------------------------------

/**
 * Coerce an ExcelJS cell value to a plain display string.
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text); // RichText / Hyperlink
    if ("result" in value) return String(value.result ?? ""); // Formula
    if ("error" in value) return String(value.error);
    return "";
  }
  return String(value);
}

/** RFC-4180 CSV cell escape. */
function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Iterate worksheet rows as string[] (drops fully-empty rows). */
function worksheetToRows(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = ((row.values as ExcelJS.CellValue[]) ?? []).slice(1);
    const cells = values.map(cellToString);
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  });
  return rows;
}

/**
 * Convert an XLSX workbook to the review format.
 * Each worksheet becomes a ReviewPage with a table ContentBlock.
 */
async function convertXlsx(buffer: Buffer, filename: string): Promise<ConversionResult> {
  const notes: string[] = [];
  const workbook = new ExcelJS.Workbook();
  // ExcelJS predates the @types/node 22 generic Buffer<ArrayBufferLike>; widen via
  // Uint8Array to match its non-generic Buffer parameter type.
  // @ts-expect-error — exceljs accepts NodeJS Buffers; @types/node generic mismatch
  await workbook.xlsx.load(buffer);
  const reviewPages: ReviewPage[] = [];

  workbook.worksheets.forEach((worksheet, i) => {
    const sheetName = worksheet.name;
    const blocks: ContentBlock[] = [];

    blocks.push({
      type: "heading",
      content: sheetName,
      level: 2,
    });

    const rows = worksheetToRows(worksheet);

    if (rows.length > 0) {
      const tableRows = rows.map((row) => row.join("\t"));
      blocks.push({
        type: "table",
        content: tableRows.join("\n"),
      });
    } else {
      blocks.push({
        type: "paragraph",
        content: "(Empty sheet)",
      });
      notes.push('Sheet "' + sheetName + '" is empty.');
    }

    const csvText = rows
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\n");

    reviewPages.push({
      pageNumber: i + 1,
      text: "[Sheet: " + sheetName + "]\n" + csvText,
      structuredContent: blocks,
    });
  });

  log.info("XLSX conversion complete", {
    filename,
    sheets: workbook.worksheets.length,
  });

  return {
    pages: reviewPages,
    originalFormat: "XLSX",
    convertedFormat: "review",
    conversionNotes: notes,
  };
}

// ---------------------------------------------------------------------------
// Plain text conversion
// ---------------------------------------------------------------------------

/**
 * Convert a plain text file to the review format.
 * Splits text into paragraph blocks on double-newlines.
 */
function convertText(buffer: Buffer, filename: string): ConversionResult {
  const text = buffer.toString("utf-8");
  const blocks = textToContentBlocks(text);

  log.info("Text conversion complete", { filename, blocks: blocks.length });

  return {
    pages: [
      {
        pageNumber: 1,
        text,
        structuredContent: blocks,
      },
    ],
    originalFormat: "TXT",
    convertedFormat: "review",
    conversionNotes: [],
  };
}

// ---------------------------------------------------------------------------
// Placeholder converters (for types handled via extracted pages)
// ---------------------------------------------------------------------------

/**
 * Placeholder for email conversion. Actual conversion happens via
 * convertFromPages after email extraction.
 */
function convertEmailPlaceholder(
  fileType: string,
  filename: string,
): ConversionResult {
  log.info(
    "Email format conversion deferred to post-extraction",
    { filename, fileType },
  );

  return {
    pages: [],
    originalFormat: fileType,
    convertedFormat: "review",
    conversionNotes: [
      "Email content will be structured after extraction. Using convertFromPages.",
    ],
  };
}

/**
 * Placeholder for PDF/image conversion. Actual conversion happens via
 * convertFromPages after OCR extraction.
 */
function convertPdfPlaceholder(
  fileType: string,
  filename: string,
): ConversionResult {
  log.info(
    "PDF/image format conversion deferred to post-extraction",
    { filename, fileType },
  );

  return {
    pages: [],
    originalFormat: fileType,
    convertedFormat: "review",
    conversionNotes: [
      "PDF/image content will be structured after OCR extraction. Using convertFromPages.",
    ],
  };
}

/**
 * Placeholder for multimedia conversion. Actual conversion happens via
 * convertFromPages after multimedia extraction.
 */
function convertMultimediaPlaceholder(
  fileType: string,
  filename: string,
): ConversionResult {
  log.info(
    "Multimedia format conversion deferred to post-extraction",
    { filename, fileType },
  );

  return {
    pages: [],
    originalFormat: fileType,
    convertedFormat: "review",
    conversionNotes: [
      "Multimedia content will be structured after transcription/analysis. Using convertFromPages.",
    ],
  };
}

// ---------------------------------------------------------------------------
// HTML to ContentBlock parser
// ---------------------------------------------------------------------------

/**
 * Parse HTML (from mammoth DOCX conversion) into an array of ContentBlocks.
 *
 * This is a lightweight parser that handles the common HTML elements
 * produced by mammoth: headings, paragraphs, lists, tables, and images.
 */
function htmlToContentBlocks(html: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (!html || html.trim().length === 0) {
    return blocks;
  }

  // Split HTML into top-level elements using a simple regex approach.
  // mammoth produces clean, flat HTML so this works reliably.
  const elementRegex =
    /<(h[1-6]|p|ul|ol|table|img)[^>]*>([\s\S]*?)<\/\1>|<(img)[^>]*\/?>/gi;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = elementRegex.exec(html)) !== null) {
    const tag = (match[1] || match[3] || "").toLowerCase();
    const innerHtml = match[2] || "";
    const plainText = stripHtmlTags(innerHtml).trim();

    // Capture any text between elements as paragraphs
    if (match.index > lastIndex) {
      const between = html.slice(lastIndex, match.index).trim();
      const betweenText = stripHtmlTags(between).trim();
      if (betweenText.length > 0) {
        blocks.push({ type: "paragraph", content: betweenText });
      }
    }
    lastIndex = match.index + match[0].length;

    if (!plainText && tag !== "img") continue;

    if (tag.startsWith("h")) {
      const level = parseInt(tag.charAt(1), 10);
      blocks.push({
        type: "heading",
        content: plainText,
        level,
      });
    } else if (tag === "p") {
      blocks.push({
        type: "paragraph",
        content: plainText,
      });
    } else if (tag === "ul" || tag === "ol") {
      const items: string[] = [];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = liRegex.exec(innerHtml)) !== null) {
        const itemText = stripHtmlTags(liMatch[1]).trim();
        if (itemText) items.push(itemText);
      }
      if (items.length > 0) {
        blocks.push({
          type: "list",
          content: items.join("\n"),
        });
      }
    } else if (tag === "table") {
      const rows: string[] = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch: RegExpExecArray | null;
      while ((trMatch = trRegex.exec(innerHtml)) !== null) {
        const cells: string[] = [];
        const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let tdMatch: RegExpExecArray | null;
        while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
          cells.push(stripHtmlTags(tdMatch[1]).trim());
        }
        if (cells.length > 0) {
          rows.push(cells.join("\t"));
        }
      }
      if (rows.length > 0) {
        blocks.push({
          type: "table",
          content: rows.join("\n"),
        });
      }
    } else if (tag === "img") {
      blocks.push({
        type: "image-placeholder",
        content: "[Embedded image]",
      });
    }
  }

  // Capture any trailing text
  if (lastIndex < html.length) {
    const trailing = stripHtmlTags(html.slice(lastIndex)).trim();
    if (trailing.length > 0) {
      blocks.push({ type: "paragraph", content: trailing });
    }
  }

  // If no structured blocks were found, fall back to treating the entire
  // HTML as a single paragraph
  if (blocks.length === 0) {
    const fullText = stripHtmlTags(html).trim();
    if (fullText.length > 0) {
      blocks.push({ type: "paragraph", content: fullText });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Text to ContentBlock parser
// ---------------------------------------------------------------------------

/**
 * Parse plain text into an array of ContentBlocks.
 *
 * Detects headings (short ALL-CAPS lines, numbered headings) and splits
 * remaining text into paragraph blocks.
 */
function textToContentBlocks(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (!text || text.trim().length === 0) {
    return blocks;
  }

  // Split on double-newlines to get paragraphs
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const para of paragraphs) {
    const firstLine = para.split("\n")[0].trim();

    // Numbered heading pattern (e.g. "1. INTRODUCTION")
    if (/^\d+\.\s+[A-Z]/.test(firstLine) && firstLine.length < 120) {
      blocks.push({
        type: "heading",
        content: firstLine,
        level: 2,
      });
      const rest = para.slice(firstLine.length).trim();
      if (rest.length > 0) {
        blocks.push({ type: "paragraph", content: rest });
      }
      continue;
    }

    // ALL-CAPS heading (short line, all uppercase)
    if (
      /^[A-Z][A-Z\s\-:]{4,}$/.test(firstLine) &&
      firstLine.length < 80
    ) {
      blocks.push({
        type: "heading",
        content: firstLine,
        level: 2,
      });
      const rest = para.slice(firstLine.length).trim();
      if (rest.length > 0) {
        blocks.push({ type: "paragraph", content: rest });
      }
      continue;
    }

    // Metadata-style blocks (e.g. "[Email Headers]\nFrom: ...")
    if (para.startsWith("[") && para.includes("]")) {
      blocks.push({
        type: "metadata",
        content: para,
      });
      continue;
    }

    // Regular paragraph
    blocks.push({
      type: "paragraph",
      content: para,
    });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags and decode common entities to produce plain text.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
