import { NextRequest, NextResponse } from "next/server";
import { buildChainOfCustodyReport } from "@/lib/pipeline/chain-of-custody";
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

    const result = await buildChainOfCustodyReport(caseId, user.name);

    return new NextResponse(new Uint8Array(result.pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="chain-of-custody-${caseId.slice(0, 8)}.pdf"`,
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
