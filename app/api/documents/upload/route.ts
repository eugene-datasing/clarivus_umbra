import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import { applyRateLimit } from "@/lib/api-utils";
import { validateFile } from "@/lib/pipeline/file-validator";
import { logger } from "@/lib/logger";
import { trackException } from "@/lib/telemetry";
import path from "path";

const log = logger.child({ module: "api", route: "/api/documents/upload" });

/** Map file extension to fileType label and MIME type */
function getFileTypeInfo(filename: string): { fileType: string; mimeType: string } {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".pdf":
      return { fileType: "PDF", mimeType: "application/pdf" };
    case ".docx":
      return {
        fileType: "DOCX",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    case ".xlsx":
      return {
        fileType: "XLSX",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    case ".eml":
      return { fileType: "EML", mimeType: "message/rfc822" };
    case ".msg":
      return { fileType: "MSG", mimeType: "application/vnd.ms-outlook" };
    case ".txt":
      return { fileType: "TXT", mimeType: "text/plain" };
    case ".pptx":
      return {
        fileType: "PPTX",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };
    case ".png":
      return { fileType: "Image", mimeType: "image/png" };
    case ".jpg":
    case ".jpeg":
      return { fileType: "Image", mimeType: "image/jpeg" };
    // Audio formats
    case ".mp3":
      return { fileType: "MP3", mimeType: "audio/mpeg" };
    case ".wav":
      return { fileType: "WAV", mimeType: "audio/wav" };
    case ".m4a":
      return { fileType: "M4A", mimeType: "audio/x-m4a" };
    // Video formats
    case ".mp4":
      return { fileType: "MP4", mimeType: "video/mp4" };
    case ".mov":
      return { fileType: "MOV", mimeType: "video/quicktime" };
    case ".avi":
      return { fileType: "AVI", mimeType: "video/x-msvideo" };
    case ".webm":
      return { fileType: "WEBM", mimeType: "video/webm" };
    default:
      return {
        fileType: ext ? ext.slice(1).toUpperCase() : "UNKNOWN",
        mimeType: "application/octet-stream",
      };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate the user
    const user = await requireUser();

    // Rate limit by authenticated user — 20 req/min
    const rateLimitResponse = applyRateLimit(`upload:${user.id}`, 20);
    if (rateLimitResponse) return rateLimitResponse;

    const formData = await request.formData();
    const caseId = formData.get("caseId") as string | null;

    if (!caseId) {
      return NextResponse.json(
        { error: "caseId is required" },
        { status: 400 },
      );
    }

    // Verify the case exists
    const existingCase = await prisma.case.findUnique({
      where: { id: caseId },
    });

    if (!existingCase) {
      return NextResponse.json(
        { error: `Case not found: ${caseId}` },
        { status: 404 },
      );
    }

    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "At least one file is required" },
        { status: 400 },
      );
    }

    // Validate file sizes (100 MB limit per file)
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `File "${file.name}" exceeds the 100 MB size limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
            code: "FILE_TOO_LARGE",
            suggestion: "Split large files or compress them before uploading.",
          },
          { status: 400 },
        );
      }
    }

    const storage = getStorage();
    const results: { id: string; name: string; status: string; warnings?: string[] }[] = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase() || ".bin";

      // Reject PST files with a clear message
      if (ext === ".pst") {
        return NextResponse.json(
          {
            error: `PST archives are not supported. Please export individual emails from "${file.name}" as EML or MSG files before uploading.`,
            code: "UNSUPPORTED_FORMAT",
            suggestion: "Export individual emails as EML or MSG files from your email client, then upload those files.",
          },
          { status: 400 },
        );
      }

      const { fileType, mimeType } = getFileTypeInfo(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());

      // -----------------------------------------------------------------
      // Validate file for corruption / readability before storing
      // -----------------------------------------------------------------
      const validation = await validateFile(buffer, file.name, mimeType);

      if (validation.corrupted) {
        log.warn("Corrupted file rejected during upload", {
          filename: file.name,
          errors: validation.errors,
          detectedType: validation.fileInfo.detectedType,
        });
        return NextResponse.json(
          {
            error: `File "${file.name}" appears to be corrupted or unreadable and cannot be processed.`,
            code: "FILE_CORRUPTED",
            details: validation.errors,
            fileInfo: {
              detectedType: validation.fileInfo.detectedType,
              declaredType: validation.fileInfo.declaredType,
              sizeBytes: validation.fileInfo.sizeBytes,
            },
            suggestion:
              "Please verify the file opens correctly in its native application, then try uploading again. If the problem persists, try re-exporting or re-saving the file.",
          },
          { status: 422 },
        );
      }

      // Create the document record first to get a Prisma-generated ID
      const doc = await prisma.document.create({
        data: {
          caseId,
          name: file.name,
          fileType,
          mimeType,
          sizeBytes: buffer.length,
          status: "queued",
        },
      });

      // Store the file using the generated document ID
      const storageKey = `${caseId}/${doc.id}/original${ext}`;
      await storage.upload(storageKey, buffer, mimeType);

      // Update the document with the storage path
      await prisma.document.update({
        where: { id: doc.id },
        data: { originalPath: storageKey },
      });

      const result: { id: string; name: string; status: string; warnings?: string[] } = {
        id: doc.id,
        name: doc.name,
        status: doc.status,
      };

      // Include warnings (e.g., password-protected files) in the response
      if (validation.warnings.length > 0) {
        result.warnings = validation.warnings;
      }

      results.push(result);
    }

    // Update the case document count
    await prisma.case.update({
      where: { id: caseId },
      data: {
        documentCount: {
          increment: results.length,
        },
      },
    });

    // Create audit entry for the upload
    await createAuditEntry({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      type: "document_upload",
      description: `Uploaded ${results.length} document${results.length > 1 ? "s" : ""}`,
      target: caseId,
      caseId,
      detail: results.map((r) => r.name).join(", "),
    });

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    log.error("Upload failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    trackException(error, { route: "/api/documents/upload" });
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Upload failed. Please try again.",
        code: "UPLOAD_ERROR",
        suggestion: message.includes("storage")
          ? "There was an issue with file storage. Please try uploading again."
          : message.includes("database") || message.includes("prisma")
          ? "There was a database issue. Please try again in a moment."
          : "An unexpected error occurred during upload. If the problem persists, contact support.",
      },
      { status: 500 },
    );
  }
}
