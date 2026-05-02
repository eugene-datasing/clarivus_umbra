import { requireCsrfHeader } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { processDocument } from "@/lib/pipeline/process";
import { requireUser } from "@/lib/auth/session";
import { authorizeForDocument } from "@/lib/auth/authorize";
import { applyRateLimit } from "@/lib/api-utils";
import { logger } from "@/lib/logger";
import { trackException } from "@/lib/telemetry";

const log = logger.child({ module: "api", route: "/api/documents/process" });

/**
 * Trigger document processing.
 *
 * Phase 6a removed the in-process job-queue layer (Phase 4 carry-
 * over). The handler now flips Document.status to "queued" and
 * fire-and-forgets the pipeline call. Any errors that escape the
 * pipeline are caught here and logged + audit-trailed via
 * trackException — Document.status itself is updated to "error" by
 * processDocument's own error path.
 *
 * The status-polling endpoint (`/api/documents/queue-status`) reads
 * Document.status directly, so the response shape and the polling
 * UI don't change.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const csrfError = requireCsrfHeader(request);
  if (csrfError) return csrfError;

  try {
    const { docId } = await params;
    const user = await requireUser();

    const rateLimitResponse = applyRateLimit(user.id, 30);
    if (rateLimitResponse) return rateLimitResponse;

    await authorizeForDocument(user, docId);

    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true, status: true },
    });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.document.update({
      where: { id: docId },
      data: { status: "queued" },
    });

    void processDocument(docId).catch((err) => {
      log.error("Document processing failed", {
        docId,
        error: err instanceof Error ? err.message : String(err),
      });
      trackException(err, { route: "/api/documents/process", docId });
    });

    return NextResponse.json({
      id: docId,
      status: "queued",
      step: "queued",
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
