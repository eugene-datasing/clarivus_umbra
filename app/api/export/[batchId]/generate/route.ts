import { requireCsrfHeader } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateExportPackage } from "@/lib/pipeline/export";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import { applyRateLimit } from "@/lib/api-utils";
import { verifyAuditIntegrity } from "@/lib/data/audit";
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

    // Verify all documents in the batch are reviewed
    const documents = await prisma.document.findMany({
      where: { batchId },
      select: { id: true, name: true, status: true },
    });

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "Batch has no documents to export" },
        { status: 400 },
      );
    }

    const blockedDocs = documents.filter((d) =>
      ["pending", "processing", "ready", "error"].includes(d.status),
    );
    if (blockedDocs.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot export unreviewed documents: ${blockedDocs.map((d) => d.name).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const auditCheck = await verifyAuditIntegrity(batchId);
    if (!auditCheck.valid) {
      log.error("Audit integrity check failed before export", {
        batchId,
        totalEntries: auditCheck.totalEntries,
        brokenAt: auditCheck.brokenAt,
      });
      return NextResponse.json(
        {
          error:
            "Audit trail integrity check failed. The audit chain may have been tampered with. Export blocked — contact an administrator.",
          code: "AUDIT_INTEGRITY_FAILURE",
        },
        { status: 409 },
      );
    }

    const exportId = await generateExportPackage(batchId, {
      generatedBy: user.name,
    });

    return NextResponse.json({ exportId });
  } catch (error) {
    log.error("Export generation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    trackException(error, { route: "/api/export/generate" });
    return NextResponse.json({ error: "Failed to start export" }, { status: 500 });
  }
}
