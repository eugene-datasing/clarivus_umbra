import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import path from "path";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import { logger } from "@/lib/logger";

/** Map file extension to MIME type for the Content-Type header */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".eml":
      return "message/rfc822";
    case ".msg":
      return "application/vnd.ms-outlook";
    case ".txt":
      return "text/plain";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "application/octet-stream"; // Serve SVGs as downloads, not inline (XSS prevention)
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: pathSegments } = await params;
    const user = await requireUser();
    await authorizeForBatch(user, pathSegments[0]);
    const key = pathSegments.join("/");

    const storage = getStorage();

    const fileExists = await storage.exists(key);
    if (!fileExists) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 },
      );
    }

    const buffer = await storage.download(key);
    const contentType = getMimeType(key);
    const filename = pathSegments[pathSegments.length - 1] || "download";

    // Force download for non-image/non-PDF types to prevent XSS via
    // HTML, SVG, or other active content served inline.
    const safeInlineTypes = new Set([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "text/plain",
    ]);
    const disposition = safeInlineTypes.has(contentType)
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("File serving failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 },
    );
  }
}
