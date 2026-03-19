import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getProcessingQueue } from "@/lib/queue/job-queue";

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

    // Enqueue the document for processing via the managed queue
    const queue = getProcessingQueue();
    const job = queue.enqueue(docId);

    return NextResponse.json({
      id: docId,
      status: job.status,
      step: job.step,
      queuePosition: queue.getStats().queued,
    });
  } catch (error) {
    console.error("Process trigger failed:", error);
    return NextResponse.json(
      { error: "Failed to trigger document processing" },
      { status: 500 },
    );
  }
}
