import { NextRequest, NextResponse } from "next/server";
import { buildWithholdingSchedule } from "@/lib/pipeline/schedule";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import { logger } from "@/lib/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await params;
    const user = await requireUser();
    await authorizeForBatch(user, batchId);

    const result = await buildWithholdingSchedule(batchId, {
      includeReasoning: true,
    });

    return new NextResponse(new Uint8Array(result.pdfBytes), {
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
