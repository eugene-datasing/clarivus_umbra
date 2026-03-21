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
import { detectDuplicates } from "./duplicate-detect";
import { executeCustomRules } from "./custom-rules";
import { calculateBBox } from "./bbox";
import { buildContent } from "./content-builder";
import { buildFeedbackPromptSection } from "./feedback-examples";
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
    // Timing instrumentation (WP13)
    // ------------------------------------------------------------------
    const timingStart = Date.now();
    let extractionMs = 0;
    let patternDetectionMs = 0;
    let aiDetectionMs = 0;

    await prisma.document.update({
      where: { id: docId },
      data: { processingStartedAt: new Date() },
    });

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
    // 2.5 File size guard
    // ------------------------------------------------------------------
    const MAX_PROCESSING_SIZE = 100 * 1024 * 1024; // 100 MB
    if (buffer.length > MAX_PROCESSING_SIZE) {
      throw new Error(
        `File too large for processing (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum: 100 MB.`,
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
    const extractionStart = Date.now();
    const extraction = await extractText(buffer, doc.fileType);
    extractionMs = Date.now() - extractionStart;

    console.log(
      `[pipeline] Extracted ${extraction.pages.length} page(s), ` +
        `${extraction.totalText.length} chars total`,
    );

    // ------------------------------------------------------------------
    // 4.5 Handle email attachments (create child documents)
    // ------------------------------------------------------------------
    if (extraction.attachments && extraction.attachments.length > 0) {
      console.log(
        `[pipeline] Email has ${extraction.attachments.length} attachment(s), creating child documents...`,
      );
      for (const att of extraction.attachments) {
        const attExt = path.extname(att.filename).toLowerCase();
        const fileTypeMap: Record<string, string> = {
          ".pdf": "PDF", ".docx": "DOCX", ".xlsx": "XLSX", ".txt": "TXT",
          ".eml": "EML", ".msg": "MSG", ".png": "PNG", ".jpg": "JPG",
          ".jpeg": "JPG", ".pptx": "PPTX",
        };
        const attFileType = fileTypeMap[attExt] || "TXT";

        // Store attachment to storage — wrap DB writes in transaction
        const attDoc = await prisma.$transaction(async (tx) => {
          const doc = await tx.document.create({
            data: {
              caseId,
              name: att.filename,
              fileType: attFileType,
              mimeType: att.contentType,
              sizeBytes: att.size,
              status: "queued",
            },
          });
          await tx.case.update({
            where: { id: caseId },
            data: { documentCount: { increment: 1 } },
          });
          return doc;
        });

        const attStorageKey = `${caseId}/${attDoc.id}/original${attExt || ".bin"}`;
        await storage.upload(attStorageKey, att.content, att.contentType);
        await prisma.document.update({
          where: { id: attDoc.id },
          data: { originalPath: attStorageKey },
        });

        // Fire-and-forget processing of the attachment
        processDocument(attDoc.id).catch((err) =>
          console.error(`[pipeline] Failed to process attachment ${att.filename}:`, err),
        );

        console.log(
          `[pipeline] Created child document for attachment: ${att.filename} (${attDoc.id})`,
        );
      }
    }

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
    // 5.5 Duplicate detection
    // ------------------------------------------------------------------
    console.log("[pipeline] Checking for duplicates...");
    const dupResult = await detectDuplicates(docId, caseId, extraction.totalText);
    if (dupResult.isExactDuplicate) {
      console.log(`[pipeline] Exact duplicate detected (group: ${dupResult.duplicateGroup})`);
    } else if (dupResult.nearDuplicateOf) {
      console.log(
        `[pipeline] Near-duplicate detected (${Math.round((dupResult.nearDuplicateSimilarity ?? 0) * 100)}% similarity)`,
      );
    }

    // ------------------------------------------------------------------
    // 5.6 Build page layout lookup for bounding box calculation
    // ------------------------------------------------------------------
    const pageLayouts = new Map<number, { words: Array<{ text: string; confidence: number; polygon?: number[] }>; width?: number; height?: number }>();
    for (const page of extraction.pages) {
      if (page.words) {
        pageLayouts.set(page.pageNumber, {
          words: page.words,
          width: page.width,
          height: page.height,
        });
      }
    }

    // ------------------------------------------------------------------
    // 6. Pattern detection
    // ------------------------------------------------------------------
    console.log("[pipeline] Running pattern detection...");
    const patternStart = Date.now();
    const patternMatches = detectPatterns(extraction.pages);
    patternDetectionMs = Date.now() - patternStart;
    console.log(`[pipeline] Found ${patternMatches.length} pattern match(es)`);

    // ------------------------------------------------------------------
    // 6.5 Custom rules detection (WP8)
    // ------------------------------------------------------------------
    let customRuleMatches: Awaited<ReturnType<typeof executeCustomRules>> = [];
    try {
      console.log("[pipeline] Running custom rules...");
      customRuleMatches = await executeCustomRules(extraction.pages);
      console.log(`[pipeline] Found ${customRuleMatches.length} custom rule match(es)`);
    } catch (rulesError) {
      console.error("[pipeline] Custom rules failed, continuing:", rulesError);
    }

    // ------------------------------------------------------------------
    // 7. AI detection
    // ------------------------------------------------------------------
    let aiDetections: Awaited<ReturnType<typeof detectWithAI>> = [];

    try {
      console.log("[pipeline] Running AI detection...");
      const aiStart = Date.now();
      const patternTexts = patternMatches.map((m) => m.text);
      const feedbackPrompt = await buildFeedbackPromptSection();
      aiDetections = await detectWithAI(extraction.pages, patternTexts, feedbackPrompt || undefined);
      aiDetectionMs = Date.now() - aiStart;
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
      const layout = pageLayouts.get(match.page);
      const bbox = layout
        ? calculateBBox(match.text, layout.words, layout.width, layout.height)
        : { posX: 0, posY: 0, posW: 0, posH: 0 };
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
          ...bbox,
        },
      });
      patternDetectionRecords.push(record);
    }

    // Store AI detections
    const aiDetectionRecords = [];
    for (const det of aiDetections) {
      const layout = pageLayouts.get(det.page);
      const bbox = layout
        ? calculateBBox(det.text, layout.words, layout.width, layout.height)
        : { posX: 0, posY: 0, posW: 0, posH: 0 };
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
          ...bbox,
        },
      });
      aiDetectionRecords.push(record);
    }

    // Store custom rule detections
    const customRuleRecords = [];
    for (const crm of customRuleMatches) {
      const layout = pageLayouts.get(crm.page);
      const bbox = layout
        ? calculateBBox(crm.text, layout.words, layout.width, layout.height)
        : { posX: 0, posY: 0, posW: 0, posH: 0 };
      const record = await prisma.detection.create({
        data: {
          documentId: docId,
          type: crm.type,
          text: crm.text,
          confidence: crm.confidence,
          page: crm.page,
          suggestedGround: crm.suggestedGround,
          reasoning: crm.reasoning,
          piConsideration: "",
          aiExplanation: `Custom rule: ${crm.ruleName}. ${crm.reasoning}`,
          source: "custom-rule",
          status: "pending",
          ...bbox,
        },
      });
      customRuleRecords.push(record);
    }

    const allDetectionRecords = [
      ...patternDetectionRecords,
      ...aiDetectionRecords,
      ...customRuleRecords,
    ];

    const totalDetections = allDetectionRecords.length;

    console.log(
      `[pipeline] Stored ${totalDetections} detection(s) ` +
        `(${patternDetectionRecords.length} pattern + ${aiDetectionRecords.length} AI + ${customRuleRecords.length} custom)`,
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

    const totalProcessingMs = Date.now() - timingStart;

    // Wrap document update + case counter increment in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: docId },
        data: {
          contentJson: JSON.parse(JSON.stringify(content)),
          detectionCount: totalDetections,
          avgConfidence: Math.round(avgConfidence * 10) / 10,
          status: "ready",
          processingError: null,
          processingCompletedAt: new Date(),
          extractionMs,
          patternDetectionMs,
          aiDetectionMs,
          totalProcessingMs,
        },
      });

      // 11. Update case counters
      await tx.case.update({
        where: { id: caseId },
        data: {
          redactionCount: {
            increment: totalDetections,
          },
        },
      });
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
        `Custom rule detections: ${customRuleRecords.length}`,
        `Average confidence: ${Math.round(avgConfidence)}%`,
        `Processing time: ${(totalProcessingMs / 1000).toFixed(1)}s (extraction: ${(extractionMs / 1000).toFixed(1)}s, patterns: ${patternDetectionMs}ms, AI: ${(aiDetectionMs / 1000).toFixed(1)}s)`,
      ].join("; "),
    });

    console.log(`[pipeline] Document ${docId} processing complete.`);
  } catch (error) {
    // ------------------------------------------------------------------
    // Error handling — classify errors for user-friendly display
    // ------------------------------------------------------------------
    const rawMessage =
      error instanceof Error ? error.message : String(error);

    // Classify the error for user-friendly display
    let userMessage: string;
    if (rawMessage.includes("Failed to download")) {
      userMessage = `File not found in storage. The uploaded file may have been lost. Please re-upload the document.`;
    } else if (rawMessage.includes("Document not found")) {
      userMessage = `Document record not found. It may have been deleted.`;
    } else if (rawMessage.includes("ECONNREFUSED") || rawMessage.includes("ENOTFOUND")) {
      userMessage = `Cannot connect to external service. Please check network connectivity and try again.`;
    } else if (rawMessage.includes("429") || rawMessage.includes("rate limit")) {
      userMessage = `AI service rate limit exceeded. The document will be retried automatically.`;
    } else if (rawMessage.includes("timeout") || rawMessage.includes("ETIMEDOUT")) {
      userMessage = `Processing timed out. The document may be too large or the service is under heavy load.`;
    } else if (rawMessage.includes("unsupported") || rawMessage.includes("Unsupported")) {
      userMessage = `Unsupported file format. ${rawMessage}`;
    } else {
      userMessage = `Processing failed: ${rawMessage.slice(0, 200)}`;
    }

    console.error(`[pipeline] Processing failed for ${docId}:`, rawMessage);

    try {
      await prisma.document.update({
        where: { id: docId },
        data: {
          status: "error",
          processingError: userMessage.slice(0, 2000),
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
