import { NextResponse } from "next/server";
import { buildAIAccuracyReport } from "@/lib/pipeline/ai-accuracy-report";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await requireUser();

    const result = await buildAIAccuracyReport();

    return new NextResponse(Buffer.from(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="ai-detection-accuracy.pdf"`,
      },
    });
  } catch (error) {
    logger.error("AI accuracy report generation failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate AI accuracy report" },
      { status: 500 },
    );
  }
}
