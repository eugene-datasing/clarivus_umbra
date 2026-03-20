import { NextRequest, NextResponse } from "next/server";
import { getProcessingQueue } from "@/lib/queue/job-queue";
import { requireUser } from "@/lib/auth/session";

/**
 * GET /api/documents/queue-status?ids=id1,id2,...
 *
 * Returns the processing queue status for the requested document IDs.
 * If no IDs are provided, returns all queue jobs.
 */
export async function GET(request: NextRequest) {
  await requireUser();
  const idsParam = request.nextUrl.searchParams.get("ids");
  const docIds = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const queue = getProcessingQueue();
  const jobs = queue.getAllJobs(docIds);
  const stats = queue.getStats();

  return NextResponse.json({ jobs, stats });
}
