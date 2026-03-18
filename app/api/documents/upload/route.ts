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

    const storage = getStorage();
    const results: { id: string; name: string; status: string }[] = [];

    for (const file of files) {
      const { fileType, mimeType } = getFileTypeInfo(file.name);
      const ext = path.extname(file.name).toLowerCase() || ".bin";
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
    return NextResponse.json(
      { error: "Upload failed", detail: String(error) },
      { status: 500 },
    );
  }
}
