import { NextRequest, NextResponse } from "next/server";
import { buildChainOfCustodyReport } from "@/lib/pipeline/chain-of-custody";
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

    const result = await buildChainOfCustodyReport(batchId, user.name);

    return new NextResponse(new Uint8Array(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="chain-of-custody-${batchId.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    logger.error("Chain of custody report generation failed:", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to generate chain of custody report" },
      { status: 500 },
    );
  }
}
