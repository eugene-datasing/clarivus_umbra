import { NextRequest, NextResponse } from "next/server";
import { buildCostRecoveryReport } from "@/lib/pipeline/cost-recovery-report";
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

    const result = await buildCostRecoveryReport(batchId);

    return new NextResponse(new Uint8Array(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="cost-recovery-${result.data.caseReference}.pdf"`,
      },
    });
  } catch (error) {
    logger.error("Cost recovery report generation failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate cost recovery report" },
      { status: 500 },
    );
  }
}
