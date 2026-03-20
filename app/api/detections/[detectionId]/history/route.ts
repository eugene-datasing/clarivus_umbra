import { NextResponse } from "next/server";
import { getDetectionHistory } from "@/lib/data/detections";
import { requireUser } from "@/lib/auth/session";
import { authorizeForDetection } from "@/lib/auth/authorize";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ detectionId: string }> },
) {
  const { detectionId } = await params;
  const user = await requireUser();
  await authorizeForDetection(user, detectionId);
  const history = await getDetectionHistory(detectionId);
  return NextResponse.json(history);
}
