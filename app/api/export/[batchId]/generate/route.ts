import { requireCsrfHeader } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateExportPackage, batchExport, type PackageType } from "@/lib/pipeline/export";
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

    // Rate limit by authenticated user — 10 req/min
    const rateLimitResponse = applyRateLimit(user.id, 10);
    if (rateLimitResponse) return rateLimitResponse;

    await authorizeForBatch(user, batchId);
    const body = await request.json();

    const packageType: PackageType = body.packageType || "internal";
    const includeCoverLetter = body.includeCoverLetter !== false;
    const includeRightOfReview = body.includeRightOfReview !== false;
    const includeChainOfCustody: boolean = body.includeChainOfCustody === true;
    const documentIds: string[] | undefined = body.documentIds;

    // --- Server-side validation ---

    if (!documentIds || documentIds.length === 0) {
      return NextResponse.json(
        { error: "No documents selected for export" },
        { status: 400 },
      );
    }

    // Verify all document IDs belong to this case and check their statuses
    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds }, batchId: batchId },
      select: { id: true, name: true, status: true },
    });

    if (documents.length !== documentIds.length) {
      return NextResponse.json(
        { error: "One or more document IDs are invalid or do not belong to this case" },
        { status: 400 },
      );
    }

    // Block documents that haven't been reviewed at all
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

    // Check for detections without applied grounds (only suggestedGround)
    const missingGrounds = await prisma.detection.count({
      where: {
        documentId: { in: documentIds },
        status: "accepted",
        appliedGround: null,
      },
    });
    if (missingGrounds > 0) {
      return NextResponse.json(
        {
          error: `${missingGrounds} accepted detection(s) have no withholding ground assigned. Apply grounds before exporting.`,
        },
        { status: 400 },
      );
    }

    // --- Verify audit integrity before export ---
    const auditCheck = await verifyAuditIntegrity(batchId);
    if (!auditCheck.valid) {
      log.error("Audit integrity check failed before export", {
        batchId,
        totalEntries: auditCheck.totalEntries,
        brokenAt: auditCheck.brokenAt,
      });
      return NextResponse.json(
        {
          error: "Audit trail integrity check failed. The audit chain may have been tampered with. Export blocked — contact an administrator.",
          code: "AUDIT_INTEGRITY_FAILURE",
        },
        { status: 409 },
      );
    }

    // --- Generate ---

    const batchMode = body.batch === true;
    const maxPagesPerBatch: number | undefined = body.maxPagesPerBatch;

    if (batchMode) {
      const result = await batchExport(batchId, packageType, {
        includeCoverLetter,
        includeRightOfReview,
        includeChainOfCustody,
        documentIds,
        generatedBy: user.name,
        maxPagesPerBatch,
      });

      return NextResponse.json({
        batch: true,
        batchGroupId: result.batchGroupId,
        exportIds: result.exportIds,
      });
    }

    const exportId = await generateExportPackage(batchId, packageType, {
      includeCoverLetter,
      includeRightOfReview,
      includeChainOfCustody,
      documentIds,
      generatedBy: user.name,
    });

    return NextResponse.json({ exportId });
  } catch (error) {
    log.error("Export generation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    trackException(error, { route: "/api/export/generate" });
    return NextResponse.json(
      { error: "Failed to start export" },
      { status: 500 },
    );
  }
}
