/**
 * File validation module for the Umbra document processing pipeline.
 *
 * Validates uploaded files for corruption, readability, and integrity before
 * they enter the processing pipeline.  All checks use Buffer-level inspection
 * (magic bytes, string searching) and do not require external packages.
 *
 * Checks performed:
 *   - Zero-byte detection
 *   - Magic byte / file header verification against declared MIME type
 *   - PDF structural integrity (%%EOF, startxref)
 *   - PDF encryption detection (/Encrypt dictionary)
 *   - DOCX/XLSX ZIP archive integrity (PK signature, central directory)
 *   - DOCX/XLSX encryption detection (EncryptedPackage entry)
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "file-validator" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileValidationResult {
  valid: boolean;
  corrupted: boolean;
  warnings: string[];
  errors: string[];
  fileInfo: {
    detectedType: string;
    declaredType: string;
    sizeBytes: number;
    isEncrypted: boolean;
    isPasswordProtected: boolean;
  };
}

// ---------------------------------------------------------------------------
// Magic byte signatures
// ---------------------------------------------------------------------------

interface MagicSignature {
  label: string;
  bytes: number[];
  offset?: number;
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  { label: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { label: "ZIP", bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK\x03\x04
  { label: "ZIP_EMPTY", bytes: [0x50, 0x4b, 0x05, 0x06] }, // PK\x05\x06 (empty archive)
  { label: "ZIP_SPANNED", bytes: [0x50, 0x4b, 0x07, 0x08] }, // PK\x07\x08 (spanned archive)
  { label: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { label: "JPEG", bytes: [0xff, 0xd8, 0xff] },
  { label: "GIF87", bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
  { label: "GIF89", bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  { label: "TIFF_LE", bytes: [0x49, 0x49, 0x2a, 0x00] }, // II*\0
  { label: "TIFF_BE", bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // MM\0*
  { label: "BMP", bytes: [0x42, 0x4d] }, // BM
  { label: "OLE2", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE2 Compound (MSG, DOC, XLS)
  // Audio formats
  { label: "ID3", bytes: [0x49, 0x44, 0x33] }, // ID3 tag (MP3 with metadata)
  { label: "MP3_SYNC", bytes: [0xff, 0xfb] }, // MP3 sync word (MPEG1 Layer3)
  { label: "MP3_SYNC2", bytes: [0xff, 0xf3] }, // MP3 sync word (MPEG2 Layer3)
  { label: "MP3_SYNC3", bytes: [0xff, 0xf2] }, // MP3 sync word (MPEG2.5 Layer3)
  { label: "WAV", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (WAV and AVI share this header)
  // Video formats — MP4/MOV use the "ftyp" box at offset 4
  { label: "MP4_FTYP", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // ftyp at offset 4
];

/**
 * Detect file type from magic bytes.
 */
function detectMagicType(buffer: Buffer): string {
  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;

    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.label;
  }

  return "UNKNOWN";
}

/**
 * Map a declared MIME type to the expected magic type label(s).
 */
function expectedMagicTypes(mimeType: string): string[] {
  const mt = mimeType.toLowerCase();

  if (mt === "application/pdf") return ["PDF"];
  if (mt.includes("wordprocessingml") || mt.includes("msword"))
    return ["ZIP", "ZIP_EMPTY", "OLE2"];
  if (mt.includes("spreadsheetml") || mt.includes("ms-excel"))
    return ["ZIP", "ZIP_EMPTY", "OLE2"];
  if (mt.includes("presentationml") || mt.includes("ms-powerpoint"))
    return ["ZIP", "ZIP_EMPTY", "OLE2"];
  if (mt === "image/png") return ["PNG"];
  if (mt === "image/jpeg") return ["JPEG"];
  if (mt === "image/gif") return ["GIF87", "GIF89"];
  if (mt === "image/tiff") return ["TIFF_LE", "TIFF_BE"];
  if (mt === "image/bmp") return ["BMP"];
  if (mt === "application/vnd.ms-outlook") return ["OLE2"];
  if (mt === "message/rfc822") return []; // EML is plain text, no magic bytes
  if (mt === "text/plain") return []; // plain text, no magic bytes
  if (mt === "application/octet-stream") return []; // generic, skip check
  // Audio formats
  if (mt === "audio/mpeg") return ["ID3", "MP3_SYNC", "MP3_SYNC2", "MP3_SYNC3"];
  if (mt === "audio/wav") return ["WAV"];
  if (mt === "audio/x-m4a") return ["MP4_FTYP"]; // M4A is an MP4 container
  // Video formats
  if (mt === "video/mp4") return ["MP4_FTYP"];
  if (mt === "video/quicktime") return ["MP4_FTYP"]; // MOV uses ftyp box
  if (mt === "video/x-msvideo") return ["WAV"]; // AVI uses RIFF container
  if (mt === "video/webm") return []; // WebM uses EBML header, skip strict check

  return [];
}

// ---------------------------------------------------------------------------
// PDF-specific checks
// ---------------------------------------------------------------------------

function validatePdf(
  buffer: Buffer,
  warnings: string[],
  errors: string[],
): { isEncrypted: boolean } {
  let isEncrypted = false;

  // Convert a reasonable tail of the file to string for structure checks.
  // PDF %%EOF can appear in the last ~1024 bytes.
  const tailSize = Math.min(buffer.length, 1024);
  const tail = buffer.subarray(buffer.length - tailSize).toString("latin1");

  if (!tail.includes("%%EOF")) {
    errors.push(
      "PDF structure error: missing %%EOF marker. The file may be truncated or corrupted.",
    );
  }

  // Check for startxref (cross-reference offset) — should appear near end
  if (!tail.includes("startxref")) {
    warnings.push(
      "PDF structure warning: missing startxref. The cross-reference table may be damaged.",
    );
  }

  // Check for encryption dictionary anywhere in the file.
  // Scan in chunks to avoid converting the entire buffer at once for very
  // large files. We look for the string "/Encrypt" in the raw PDF text.
  const chunkSize = 64 * 1024;
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize + 20, buffer.length); // overlap to avoid split
    const chunk = buffer.subarray(offset, end).toString("latin1");
    if (chunk.includes("/Encrypt")) {
      isEncrypted = true;
      warnings.push(
        "PDF is encrypted or password-protected. Content extraction may fail or produce empty results.",
      );
      break;
    }
  }

  return { isEncrypted };
}

// ---------------------------------------------------------------------------
// ZIP-based format checks (DOCX, XLSX, PPTX)
// ---------------------------------------------------------------------------

function validateZipArchive(
  buffer: Buffer,
  filename: string,
  warnings: string[],
  errors: string[],
): { isEncrypted: boolean } {
  let isEncrypted = false;

  // A valid ZIP file must start with PK (0x50 0x4B)
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    errors.push(
      `File "${filename}" does not have a valid ZIP/Office archive header. The file may be corrupted.`,
    );
    return { isEncrypted };
  }

  // Check for End of Central Directory record (EOCD).
  // The EOCD signature is PK\x05\x06 (0x50 0x4B 0x05 0x06).
  // It must appear in the last 65557 bytes of the file.
  const eocdSearchSize = Math.min(buffer.length, 65557);
  const eocdRegion = buffer.subarray(buffer.length - eocdSearchSize);
  let hasEocd = false;

  for (let i = eocdRegion.length - 4; i >= 0; i--) {
    if (
      eocdRegion[i] === 0x50 &&
      eocdRegion[i + 1] === 0x4b &&
      eocdRegion[i + 2] === 0x05 &&
      eocdRegion[i + 3] === 0x06
    ) {
      hasEocd = true;
      break;
    }
  }

  if (!hasEocd) {
    errors.push(
      `ZIP archive for "${filename}" is missing the End of Central Directory record. The file is likely truncated or corrupted.`,
    );
  }

  // Check for EncryptedPackage — Office files that are password-protected
  // store data in an OLE2 container with an "EncryptedPackage" stream.
  // However, if the file starts with PK, it's a normal OOXML file; encrypted
  // OOXML files start with OLE2 (D0 CF 11 E0). So if we got here, it is
  // likely not encrypted in the standard way. Still, check for the string
  // inside the ZIP just in case some custom encryption was applied.
  const fileStr = buffer.toString("latin1");
  if (fileStr.includes("EncryptedPackage")) {
    isEncrypted = true;
    warnings.push(
      `File "${filename}" appears to be encrypted or password-protected. Processing may fail.`,
    );
  }

  return { isEncrypted };
}

/**
 * Check if an OLE2 compound document (MSG, old DOC/XLS) is encrypted.
 */
function validateOle2(
  buffer: Buffer,
  filename: string,
  warnings: string[],
  _errors: string[],
): { isEncrypted: boolean } {
  let isEncrypted = false;

  // OLE2 encrypted Office files contain an "EncryptedPackage" stream
  const fileStr = buffer.toString("latin1");
  if (fileStr.includes("EncryptedPackage")) {
    isEncrypted = true;
    warnings.push(
      `File "${filename}" appears to be encrypted or password-protected. Processing may fail.`,
    );
  }

  return { isEncrypted };
}

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validate a file buffer for corruption, readability, and integrity.
 *
 * @param buffer - The raw file bytes
 * @param filename - The original filename (used for extension-based heuristics)
 * @param declaredMimeType - The MIME type declared during upload
 * @returns Validation result with errors, warnings, and file info
 */
export async function validateFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType: string,
): Promise<FileValidationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  let isEncrypted = false;
  let isPasswordProtected = false;

  // ------------------------------------------------------------------
  // 1. Zero-byte check
  // ------------------------------------------------------------------
  if (buffer.length === 0) {
    errors.push("File is empty (zero bytes). Cannot process an empty file.");
    return {
      valid: false,
      corrupted: true,
      warnings,
      errors,
      fileInfo: {
        detectedType: "EMPTY",
        declaredType: declaredMimeType,
        sizeBytes: 0,
        isEncrypted: false,
        isPasswordProtected: false,
      },
    };
  }

  // ------------------------------------------------------------------
  // 2. Detect actual type via magic bytes
  // ------------------------------------------------------------------
  const detectedType = detectMagicType(buffer);

  // ------------------------------------------------------------------
  // 3. Compare detected type with declared MIME type
  // ------------------------------------------------------------------
  const expected = expectedMagicTypes(declaredMimeType);
  if (expected.length > 0 && !expected.includes(detectedType)) {
    // Special case: OLE2 compound documents can be encrypted DOCX/XLSX
    if (detectedType === "OLE2" && expected.some((e) => e === "ZIP")) {
      // This is likely an encrypted Office document stored in OLE2 format
      const ole2Result = validateOle2(buffer, filename, warnings, errors);
      isEncrypted = ole2Result.isEncrypted;
      if (isEncrypted) {
        isPasswordProtected = true;
      } else {
        warnings.push(
          `File "${filename}" is an OLE2 compound document. It may be a legacy Office format or encrypted.`,
        );
      }
    } else {
      errors.push(
        `File type mismatch: "${filename}" was declared as ${declaredMimeType} ` +
          `but the file header indicates ${detectedType}. The file may be misnamed or corrupted.`,
      );
    }
  }

  // ------------------------------------------------------------------
  // 4. Format-specific structural validation
  // ------------------------------------------------------------------
  if (detectedType === "PDF") {
    const pdfResult = validatePdf(buffer, warnings, errors);
    isEncrypted = pdfResult.isEncrypted;
    isPasswordProtected = isEncrypted;
  } else if (
    detectedType === "ZIP" ||
    detectedType === "ZIP_EMPTY" ||
    detectedType === "ZIP_SPANNED"
  ) {
    const zipResult = validateZipArchive(buffer, filename, warnings, errors);
    isEncrypted = zipResult.isEncrypted;
    isPasswordProtected = isEncrypted;
  } else if (detectedType === "OLE2" && expected.length === 0) {
    // OLE2 but no specific expected type — could be MSG
    const ole2Result = validateOle2(buffer, filename, warnings, errors);
    isEncrypted = ole2Result.isEncrypted;
    isPasswordProtected = isEncrypted;
  }

  // ------------------------------------------------------------------
  // 5. Build result
  // ------------------------------------------------------------------
  const corrupted = errors.length > 0;
  const valid = !corrupted;

  if (corrupted) {
    log.warn("File validation failed", {
      filename,
      errors,
      detectedType,
      declaredMimeType,
    });
  } else if (warnings.length > 0) {
    log.info("File validation passed with warnings", {
      filename,
      warnings,
      detectedType,
    });
  }

  return {
    valid,
    corrupted,
    warnings,
    errors,
    fileInfo: {
      detectedType,
      declaredType: declaredMimeType,
      sizeBytes: buffer.length,
      isEncrypted,
      isPasswordProtected,
    },
  };
}
