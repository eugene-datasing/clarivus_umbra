import { NextRequest, NextResponse } from "next/server";
import { buildAuditTimeline } from "@/lib/pipeline/audit-timeline";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();

    const batchId = request.nextUrl.searchParams.get("batchId");
    if (!batchId) {
      return NextResponse.json(
        { error: "Missing required query parameter: batchId" },
        { status: 400 },
      );
    }

    await authorizeForBatch(user, batchId);

    const result = await buildAuditTimeline(batchId, user.name);

    return new NextResponse(new Uint8Array(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="audit-timeline-${batchId.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    logger.error("Audit timeline report generation failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate audit timeline report" },
      { status: 500 },
    );
  }
}
