import { NextRequest, NextResponse } from "next/server";
import { getExportProgress } from "@/lib/pipeline/export";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string; exportId: string }> },
) {
  const { exportId } = await params;

  const progress = getExportProgress(exportId);
  if (!progress) {
    return NextResponse.json(
      { error: "Export not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(progress);
}
