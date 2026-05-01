import { NextRequest, NextResponse } from "next/server";
import { getExportProgress } from "@/lib/pipeline/export";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string; exportId: string }> },
) {
  const { batchId, exportId } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, batchId);

  const progress = await getExportProgress(exportId);
  if (!progress) {
    return NextResponse.json(
      { error: "Export not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(progress);
}
