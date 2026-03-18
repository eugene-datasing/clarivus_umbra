import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const { docId } = await params;

    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        status: true,
        pageCount: true,
        detectionCount: true,
        processingError: true,
      },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: doc.id,
      status: doc.status,
      pageCount: doc.pageCount,
      detectionCount: doc.detectionCount,
      error: doc.processingError,
    });
  } catch (error) {
    console.error("Status check failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch document status" },
      { status: 500 },
    );
  }
}
