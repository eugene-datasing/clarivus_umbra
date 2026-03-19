import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import path from "path";

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
    default:
      return {
        fileType: ext ? ext.slice(1).toUpperCase() : "UNKNOWN",
        mimeType: "application/octet-stream",
      };
  }
}

export async function POST(request: NextRequest) {
  try {
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
    const results: { id: string; name: string; status: string }[] = [];

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

      results.push({
        id: doc.id,
        name: doc.name,
        status: doc.status,
      });
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
      userName: "System",
      userRole: "system",
      type: "document_upload",
      description: `Uploaded ${results.length} document${results.length > 1 ? "s" : ""}`,
      target: caseId,
      caseId,
      detail: results.map((r) => r.name).join(", "),
    });

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error("Upload failed:", error);
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
