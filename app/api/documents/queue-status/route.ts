import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

/**
 * GET /api/documents/queue-status?ids=id1,id2,...
 *
 * Returns the processing-queue snapshot for the requested document
 * IDs. Phase 6a removed the in-process job-queue layer; the
 * underlying truth is now Document.status read directly. We preserve
 * the legacy { jobs: [...], stats: {...} } response shape so
 * ingest-client.tsx's polling loop doesn't need to change.
 *
 * `step` is synthesised from Document.status; `progress` is a coarse
 * 0/50/100 derived from status; `attempt` is always 1 (no retry
 * tracking without the queue).
 */
export async function GET(request: NextRequest) {
  await requireUser();

  const idsParam = request.nextUrl.searchParams.get("ids");
  const docIds = idsParam ? idsParam.split(",").filter(Boolean) : null;

  const where = docIds && docIds.length > 0 ? { id: { in: docIds } } : {};
  const docs = await prisma.document.findMany({
    where,
    select: {
      id: true,
      status: true,
      processingStep: true,
      processingProgress: true,
    },
  });

  // Phase 12.6a — when the pipeline has written a fine-grained step
  // (processingStep / processingProgress), surface it directly.
  // Otherwise fall back to the coarse status-derived synthesis from
  // before, so docs that haven't yet been touched by the new pipeline
  // (or queued docs that haven't started) still produce a meaningful
  // step value.
  const jobs = docs
    .filter((d) => d.status === "queued" || d.status === "processing")
    .map((d) => ({
      docId: d.id,
      step: d.processingStep ?? d.status,
      progress:
        d.processingProgress ??
        (d.status === "processing" ? 50 : 0),
      attempt: 1,
    }));

  const queuedCount = docs.filter((d) => d.status === "queued").length;
  const processingCount = docs.filter((d) => d.status === "processing").length;

  return NextResponse.json({
    jobs,
    stats: {
      queued: queuedCount,
      processing: processingCount,
    },
  });
}
