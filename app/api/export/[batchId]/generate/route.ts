import { requireCsrfHeader } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { runExportForBatch } from "@/lib/pipeline/export-runner";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import { applyRateLimit } from "@/lib/api-utils";
import { logger } from "@/lib/logger";
import { trackException } from "@/lib/telemetry";

const log = logger.child({ module: "api", route: "/api/export/generate" });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const csrfError = requireCsrfHeader(request);
  if (csrfError) return csrfError;

  try {
    const { batchId } = await params;
    const user = await requireUser();

    const rateLimitResponse = applyRateLimit(user.id, 10);
    if (rateLimitResponse) return rateLimitResponse;

    await authorizeForBatch(user, batchId);

    // Phase 12.2 — orchestration extracted to runExportForBatch so the
    // auto-export pg-boss handler calls the same function. The route
    // owns CSRF / auth / rate-limit / authorisation; the runner owns
    // batch-state validation + audit integrity + the generateExportPackage
    // kick-off.
    const result = await runExportForBatch(batchId, { generatedBy: user.name });

    if (result.ok) {
      return NextResponse.json({ exportId: result.exportId });
    }

    if (result.errorCode === "BATCH_EMPTY" || result.errorCode === "BLOCKED_DOCS") {
      return NextResponse.json({ error: result.errorMessage }, { status: 400 });
    }
    if (result.errorCode === "AUDIT_INTEGRITY_FAILURE") {
      return NextResponse.json(
        { error: result.errorMessage, code: "AUDIT_INTEGRITY_FAILURE" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: result.errorMessage ?? "Export failed" }, { status: 400 });
  } catch (error) {
    log.error("Export generation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    trackException(error, { route: "/api/export/generate" });
    return NextResponse.json({ error: "Failed to start export" }, { status: 500 });
  }
}
