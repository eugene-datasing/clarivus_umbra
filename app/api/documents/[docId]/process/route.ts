import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { processDocument } from "@/lib/pipeline/process";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const { docId } = await params;

    const doc = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Update status to processing
    await prisma.document.update({
      where: { id: docId },
      data: { status: "processing" },
    });

    // Fire-and-forget: kick off processing without blocking the response
    processDocument(docId).catch((err) =>
      console.error(`Processing failed for ${docId}:`, err),
    );

    return NextResponse.json({
      id: docId,
      status: "processing",
    });
  } catch (error) {
    console.error("Process trigger failed:", error);
    return NextResponse.json(
      { error: "Failed to trigger document processing" },
      { status: 500 },
    );
  }
}
