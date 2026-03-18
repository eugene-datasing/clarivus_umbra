import { NextRequest, NextResponse } from "next/server";
import { generateExportPackage, type PackageType } from "@/lib/pipeline/export";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await params;
    const body = await request.json();

    const packageType: PackageType = body.packageType || "internal";
    const includeCoverLetter = body.includeCoverLetter !== false;
    const includeRightOfReview = body.includeRightOfReview !== false;

    const exportId = await generateExportPackage(requestId, packageType, {
      includeCoverLetter,
      includeRightOfReview,
    });

    return NextResponse.json({ exportId });
  } catch (error) {
    console.error("Export generation failed:", error);
    return NextResponse.json(
      { error: "Failed to start export" },
      { status: 500 },
    );
  }
}
