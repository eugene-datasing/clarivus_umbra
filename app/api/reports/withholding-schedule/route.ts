import { NextRequest, NextResponse } from "next/server";
import { buildWithholdingSchedule } from "@/lib/pipeline/schedule";
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

    const result = await buildWithholdingSchedule(caseId, {
      includeReasoning: request.nextUrl.searchParams.get("reasoning") === "true",
    });

    return new NextResponse(Buffer.from(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="withholding-schedule-${caseId.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    logger.error("Withholding schedule report generation failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate withholding schedule report" },
      { status: 500 },
    );
  }
}
