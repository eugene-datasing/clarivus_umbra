import { NextRequest, NextResponse } from "next/server";
import { buildWithholdingSchedule } from "@/lib/pipeline/schedule";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import { logger } from "@/lib/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params;
    const user = await requireUser();
    await authorizeForCase(user, requestId);

    const result = await buildWithholdingSchedule(requestId, {
      includeReasoning: true,
    });

    return new NextResponse(Buffer.from(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="withholding-schedule.pdf"`,
      },
    });
  } catch (error) {
    logger.error("Schedule PDF generation failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate schedule PDF" },
      { status: 500 },
    );
  }
}
