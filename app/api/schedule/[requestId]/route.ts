import { NextRequest, NextResponse } from "next/server";
import { buildWithholdingSchedule } from "@/lib/pipeline/schedule";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params;

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
    console.error("Schedule PDF generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate schedule PDF" },
      { status: 500 },
    );
  }
}
