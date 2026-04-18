import { NextResponse } from "next/server";
import { buildComplianceSummaryReport } from "@/lib/pipeline/compliance-summary-report";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await requireUser();

    const result = await buildComplianceSummaryReport();

    return new NextResponse(new Uint8Array(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="lgoima-compliance-summary.pdf"`,
      },
    });
  } catch (error) {
    logger.error("Compliance summary report generation failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate compliance summary report" },
      { status: 500 },
    );
  }
}
