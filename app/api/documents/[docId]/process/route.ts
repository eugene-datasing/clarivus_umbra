import { requireCsrfHeader } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getProcessingQueue } from "@/lib/queue/job-queue";
import { requireUser } from "@/lib/auth/session";
import { authorizeForDocument } from "@/lib/auth/authorize";
import { applyRateLimit } from "@/lib/api-utils";
import { logger } from "@/lib/logger";
import { trackException } from "@/lib/telemetry";

const log = logger.child({ module: "api", route: "/api/documents/process" });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const csrfError = requireCsrfHeader(request);
  if (csrfError) return csrfError;

  try {
    const { docId } = await params;
    const user = await requireUser();

    // Rate limit by authenticated user — 30 req/min
    const rateLimitResponse = applyRateLimit(user.id, 30);
    if (rateLimitResponse) return rateLimitResponse;

    await authorizeForDocument(user, docId);

    const doc = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Enqueue the document for processing via the managed queue
    const queue = getProcessingQueue();
    const job = await queue.enqueue(docId);
    const stats = await queue.getStats();

    return NextResponse.json({
      id: docId,
      status: job.status,
      step: job.step,
      queuePosition: stats.queued,
    });
  } catch (error) {
    log.error("Process trigger failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    trackException(error, { route: "/api/documents/process" });
    return NextResponse.json(
      { error: "Failed to trigger document processing" },
      { status: 500 },
    );
  }
}
