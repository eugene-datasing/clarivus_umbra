/**
 * Main document processing orchestrator for the Veil pipeline.
 *
 * Coordinates the full processing flow for a single document:
 *   1. Fetch document metadata from DB
 *   2. Download the original file from storage
 *   3. Extract text (OCR for PDFs/images, library-based for DOCX/XLSX/TXT)
 *   4. Store extracted page text in DocumentPage rows
 *   5. Run regex-based pattern detection
 *   6. Run AI-based detection via Azure OpenAI
 *   7. Merge and store all detections in the Detection table
 *   8. Build the DocParagraph[] content structure for the review UI
 *   9. Update document and case counters
 *  10. Create an audit trail entry
 */

import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { extractText } from "./extract";
import { detectPatterns } from "./patterns";
import { detectWithAI } from "./ai-detect";
import { buildContent } from "./content-builder";
import { createAuditEntry } from "@/lib/data/audit";
import path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the file extension from a document filename. */
function getExtension(filename: string): string {
  return path.extname(filename).toLowerCase() || ".bin";
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Process a single document through the full Veil pipeline.
 *
 * This function is designed to be called in a fire-and-forget manner from the
 * API route.  It manages its own error handling and will set the document
 * status to "error" if anything goes wrong.
 *
 * @param docId - The Prisma document ID to process.
 */
export async function processDocument(docId: string): Promise<void> {
  console.log(`[pipeline] Starting processing for document ${docId}`);

  try {
    // ------------------------------------------------------------------
    // 1. Fetch document from DB
    // ------------------------------------------------------------------
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      include: { case: true },
    });

    if (!doc) {
      throw new Error(`Document not found: ${docId}`);
    }

    const caseId = doc.caseId;

    // ------------------------------------------------------------------
    // 2. Download file from storage
    // ------------------------------------------------------------------
    const ext = getExtension(doc.name);
    const storageKey =
      doc.originalPath || `${caseId}/${docId}/original${ext}`;

    console.log(`[pipeline] Downloading file: ${storageKey}`);

    const storage = getStorage();
    let buffer: Buffer;
    try {
      buffer = await storage.download(storageKey);
    } catch (downloadErr) {
      throw new Error(
        `Failed to download file from storage (key: ${storageKey}): ${downloadErr}`,
      );
    }

    // ------------------------------------------------------------------
    // 3. Update status to "processing"
    // ------------------------------------------------------------------
    await prisma.document.update({
      where: { id: docId },
      data: { status: "processing" },
    });

    // ------------------------------------------------------------------
    // 4. Extract text
    // ------------------------------------------------------------------
    console.log(`[pipeline] Extracting text (type: ${doc.fileType})`);
    const extraction = await extractText(buffer, doc.fileType);

    console.log(
      `[pipeline] Extracted ${extraction.pages.length} page(s), ` +
        `${extraction.totalText.length} chars total`,
    );

    // ------------------------------------------------------------------
    // 5. Store pages in DocumentPage table
    // ------------------------------------------------------------------
    // Delete any existing pages first (in case of reprocessing)
    await prisma.documentPage.deleteMany({ where: { documentId: docId } });

    for (const page of extraction.pages) {
      await prisma.documentPage.create({
        data: {
          documentId: docId,
          pageNumber: page.pageNumber,
          text: page.text,
          width: page.width ?? null,
          height: page.height ?? null,
          layoutJson: page.words
            ? JSON.parse(JSON.stringify(page.words))
            : null,
        },
      });
    }

    // Update document page count
    await prisma.document.update({
      where: { id: docId },
      data: { pageCount: extraction.pages.length },
    });

    // ------------------------------------------------------------------
    // 6. Pattern detection
    // ------------------------------------------------------------------
    console.log("[pipeline] Running pattern detection...");
    const patternMatches = detectPatterns(extraction.pages);
    console.log(`[pipeline] Found ${patternMatches.length} pattern match(es)`);

    // ------------------------------------------------------------------
    // 7. AI detection
    // ------------------------------------------------------------------
    let aiDetections: Awaited<ReturnType<typeof detectWithAI>> = [];

    try {
      console.log("[pipeline] Running AI detection...");
      const patternTexts = patternMatches.map((m) => m.text);
      aiDetections = await detectWithAI(extraction.pages, patternTexts);
      console.log(`[pipeline] Found ${aiDetections.length} AI detection(s)`);
    } catch (aiError) {
      // AI detection is non-critical -- log and continue with pattern-only
      console.error(
        "[pipeline] AI detection failed, continuing with pattern-only results:",
        aiError,
      );
    }

    // ------------------------------------------------------------------
    // 8. Store detections in DB
    // ------------------------------------------------------------------
    // Delete any existing detections first (in case of reprocessing)
    await prisma.detection.deleteMany({ where: { documentId: docId } });

    // Store pattern detections
    const patternDetectionRecords = [];
    for (const match of patternMatches) {
      const record = await prisma.detection.create({
        data: {
          documentId: docId,
          type: match.type,
          text: match.text,
          confidence: match.confidence,
          page: match.page,
          suggestedGround: match.suggestedGround,
          reasoning: match.reasoning,
          piConsideration: "",
          aiExplanation: `Pattern-detected ${match.type}. ${match.reasoning}`,
          source: "pattern",
          status: "pending",
        },
      });
      patternDetectionRecords.push(record);
    }

    // Store AI detections
    const aiDetectionRecords = [];
    for (const det of aiDetections) {
      const record = await prisma.detection.create({
        data: {
          documentId: docId,
          type: det.type,
          text: det.text,
          confidence: det.confidence,
          page: det.page,
          suggestedGround: det.suggestedGround,
          reasoning: det.reasoning,
          piConsideration: det.piConsideration,
          aiExplanation: det.aiExplanation,
          source: "ai",
          status: "pending",
        },
      });
      aiDetectionRecords.push(record);
    }

    const allDetectionRecords = [
      ...patternDetectionRecords,
      ...aiDetectionRecords,
    ];

    const totalDetections = allDetectionRecords.length;

    console.log(
      `[pipeline] Stored ${totalDetections} detection(s) ` +
        `(${patternDetectionRecords.length} pattern + ${aiDetectionRecords.length} AI)`,
    );

    // ------------------------------------------------------------------
    // 9. Build content for review UI
    // ------------------------------------------------------------------
    console.log("[pipeline] Building content structure for review UI...");

    const contentDetections = allDetectionRecords.map((r) => ({
      id: r.id,
      type: r.type,
      text: r.text,
      page: r.page,
      confidence: r.confidence,
      suggestedGround: r.suggestedGround,
    }));

    const content = buildContent(extraction.pages, contentDetections);

    // ------------------------------------------------------------------
    // 10. Update document with results
    // ------------------------------------------------------------------
    const avgConfidence =
      totalDetections > 0
        ? allDetectionRecords.reduce((sum, d) => sum + d.confidence, 0) /
          totalDetections
        : 0;

    await prisma.document.update({
      where: { id: docId },
      data: {
        contentJson: JSON.parse(JSON.stringify(content)),
        detectionCount: totalDetections,
        avgConfidence: Math.round(avgConfidence * 10) / 10,
        status: "ready",
        processingError: null,
      },
    });

    // ------------------------------------------------------------------
    // 11. Update case counters
    // ------------------------------------------------------------------
    await prisma.case.update({
      where: { id: caseId },
      data: {
        redactionCount: {
          increment: totalDetections,
        },
      },
    });

    // ------------------------------------------------------------------
    // 12. Audit trail
    // ------------------------------------------------------------------
    await createAuditEntry({
      userName: "Veil AI",
      userRole: "system",
      type: "document_processed",
      description: `Document processed: ${extraction.pages.length} page(s), ${totalDetections} detection(s) found`,
      target: doc.name,
      caseId,
      detail: [
        `File type: ${doc.fileType}`,
        `Pages: ${extraction.pages.length}`,
        `Pattern detections: ${patternDetectionRecords.length}`,
        `AI detections: ${aiDetectionRecords.length}`,
        `Average confidence: ${Math.round(avgConfidence)}%`,
      ].join("; "),
    });

    console.log(`[pipeline] Document ${docId} processing complete.`);
  } catch (error) {
    // ------------------------------------------------------------------
    // Error handling
    // ------------------------------------------------------------------
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error(`[pipeline] Processing failed for ${docId}:`, errorMessage);

    try {
      await prisma.document.update({
        where: { id: docId },
        data: {
          status: "error",
          processingError: errorMessage.slice(0, 2000),
        },
      });
    } catch (updateErr) {
      console.error(
        `[pipeline] Failed to update error status for ${docId}:`,
        updateErr,
      );
    }
  }
}
