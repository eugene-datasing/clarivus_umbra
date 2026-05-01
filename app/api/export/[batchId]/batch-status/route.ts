import { NextRequest, NextResponse } from "next/server";
import { getBatchExportProgress } from "@/lib/pipeline/export";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const user = await requireUser();
  await authorizeForCase(user, requestId);

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
