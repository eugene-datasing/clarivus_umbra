import { NextResponse } from "next/server";
import { buildReviewerWorkloadReport } from "@/lib/pipeline/reviewer-workload-report";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await requireUser();

    const result = await buildReviewerWorkloadReport();

    return new NextResponse(Buffer.from(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="reviewer-workload-analysis.pdf"`,
      },
    });
  } catch (error) {
    logger.error("Reviewer workload report generation failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate reviewer workload report" },
      { status: 500 },
    );
  }
}
