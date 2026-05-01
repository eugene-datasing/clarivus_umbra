import { NextRequest, NextResponse } from "next/server";
import { getBatchExportProgress } from "@/lib/pipeline/export";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, batchId);

  const batchGroupId = request.nextUrl.searchParams.get("batchGroupId");
  if (!batchGroupId) {
    return NextResponse.json(
      { error: "batchGroupId query parameter is required" },
      { status: 400 },
    );
  }

  const progress = await getBatchExportProgress(batchGroupId);
  if (!progress) {
    return NextResponse.json(
      { error: "Batch export not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(progress);
}
