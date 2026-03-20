import { NextRequest, NextResponse } from "next/server";
import { getExportProgress } from "@/lib/pipeline/export";
import { getStorage } from "@/lib/storage";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string; exportId: string }> },
) {
  const { requestId, exportId } = await params;
  const user = await requireUser();
  await authorizeForCase(user, requestId);

  const progress = getExportProgress(exportId);
  if (!progress || progress.status !== "complete" || !progress.downloadKey) {
    return NextResponse.json(
      { error: "Export not ready or not found" },
      { status: 404 },
    );
  }

  try {
    const storage = getStorage();
    const buffer = await storage.download(progress.downloadKey);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${progress.filename || "export.zip"}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("Download failed:", error);
    return NextResponse.json(
      { error: "Failed to download export" },
      { status: 500 },
    );
  }
}
