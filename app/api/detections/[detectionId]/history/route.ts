import { NextResponse } from "next/server";
import { getDetectionHistory } from "@/lib/data/detections";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ detectionId: string }> },
) {
  const { detectionId } = await params;
  const history = await getDetectionHistory(detectionId);
  return NextResponse.json(history);
}
