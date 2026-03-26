import { NextRequest, NextResponse } from "next/server";
import { buildCostRecoveryReport } from "@/lib/pipeline/cost-recovery-report";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();

    const caseId = request.nextUrl.searchParams.get("caseId");
    if (!caseId) {
      return NextResponse.json(
        { error: "Missing required query parameter: caseId" },
        { status: 400 },
      );
    }

    await authorizeForCase(user, caseId);

    const result = await buildCostRecoveryReport(caseId);

    return new NextResponse(Buffer.from(result.pdfBytes), {
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
