import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateExportPackage, type PackageType } from "@/lib/pipeline/export";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import { applyRateLimit } from "@/lib/api-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params;
    const user = await requireUser();

    // Rate limit by authenticated user — 10 req/min
    const rateLimitResponse = applyRateLimit(user.id, 10);
    if (rateLimitResponse) return rateLimitResponse;

    await authorizeForCase(user, requestId);
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
      where: { id: { in: documentIds }, caseId: requestId },
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

    // --- Generate ---

    const exportId = await generateExportPackage(requestId, packageType, {
      includeCoverLetter,
      includeRightOfReview,
      includeChainOfCustody,
      documentIds,
      generatedBy: user.name,
    });

    return NextResponse.json({ exportId });
  } catch (error) {
    console.error("Export generation failed:", error);
    return NextResponse.json(
      { error: "Failed to start export" },
      { status: 500 },
    );
  }
}
