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
import { recomputeCaseStatus } from "@/lib/data/cases";
import { getStorage } from "@/lib/storage";
import { extractText, OCRUnavailableError, ExtractionCorruptionError } from "./extract";
import { validateFile } from "./file-validator";
import { convertFromPages, convertToReviewFormat } from "./format-converter";
import { detectPatterns } from "./patterns";
import { detectWithAI } from "./ai-detect";
import { classifyDocument, type DocumentClassification } from "./doc-classify";
import { detectDuplicates } from "./duplicate-detect";
import { executeCustomRules } from "./custom-rules";
import { calculateBBoxAll } from "./bbox";
import { buildContent, buildContentFromBlocks, verifyDetectionCoverage } from "./content-builder";
import { buildFeedbackPromptSection } from "./feedback-examples";
import { createAuditEntry } from "@/lib/data/audit";
import { getEnabledDetectionTypes } from "@/lib/data/settings";
import { CircuitOpenError } from "@/lib/resilience/azure-services";
import { logger } from "@/lib/logger";
import { trackException, trackEvent, trackMetric } from "@/lib/telemetry";
import path from "path";

const log = logger.child({ module: "pipeline" });

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
  log.info("Starting processing", { docId });

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

    log.info("Downloading file", { docId, storageKey });

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
    // 2.6 File integrity validation
    // ------------------------------------------------------------------
    log.info("Validating file integrity", { docId, filename: doc.name });
    const validation = await validateFile(buffer, doc.name, doc.mimeType);

    if (validation.corrupted) {
      const errorMsg =
        `File is corrupted or unreadable: ${validation.errors.join("; ")}`;
      log.error("File validation failed — corrupted file", {
        docId,
        errors: validation.errors,
        detectedType: validation.fileInfo.detectedType,
      });

      await prisma.document.update({
        where: { id: docId },
        data: {
          status: "error",
          processingError: errorMsg.slice(0, 2000),
        },
      });

      await createAuditEntry({
        userName: "Veil AI",
        userRole: "system",
        type: "document_error",
        description: `File validation failed: corrupted or unreadable file`,
        target: doc.name,
        caseId,
        detail: [
          `Detected type: ${validation.fileInfo.detectedType}`,
          `Declared type: ${validation.fileInfo.declaredType}`,
          `Errors: ${validation.errors.join("; ")}`,
        ].join("; "),
      });

      return; // Skip further processing
    }

    if (validation.fileInfo.isEncrypted || validation.fileInfo.isPasswordProtected) {
      const warnMsg =
        `File is encrypted or password-protected. Processing may fail or produce empty results. ${validation.warnings.join("; ")}`;
      log.warn("File is encrypted/password-protected", {
        docId,
        warnings: validation.warnings,
      });

      await prisma.document.update({
        where: { id: docId },
        data: {
          status: "error",
          processingError: warnMsg.slice(0, 2000),
        },
      });

      await createAuditEntry({
        userName: "Veil AI",
        userRole: "system",
        type: "document_error",
        description: `File is encrypted or password-protected`,
        target: doc.name,
        caseId,
        detail: [
          `Detected type: ${validation.fileInfo.detectedType}`,
          `Warnings: ${validation.warnings.join("; ")}`,
        ].join("; "),
      });

      return; // Skip further processing
    }

    if (validation.warnings.length > 0) {
      log.warn("File validation passed with warnings", {
        docId,
        warnings: validation.warnings,
      });
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
    log.info("Extracting text", { docId, fileType: doc.fileType });
    const extractionStart = Date.now();
    let extraction;
    try {
      extraction = await extractText(buffer, doc.fileType);
    } catch (extractError) {
      if (extractError instanceof OCRUnavailableError) {
        // OCR service circuit is open -- mark document as error and bail out
        // without crashing the entire processing queue.
        log.error("OCR service unavailable, marking document as error", { docId });
        await prisma.document.update({
          where: { id: docId },
          data: {
            status: "error",
            processingError: "OCR service temporarily unavailable. The document will be retried when the service recovers.",
          },
        });
        return;
      }
      if (extractError instanceof ExtractionCorruptionError) {
        // File passed initial validation but failed during content extraction
        // due to corruption or password protection detected by the extractor.
        const corruptionMsg = extractError.message;
        log.error("File corruption detected during extraction", {
          docId,
          error: corruptionMsg,
        });
        await prisma.document.update({
          where: { id: docId },
          data: {
            status: "error",
            processingError: corruptionMsg.slice(0, 2000),
          },
        });

        await createAuditEntry({
          userName: "Veil AI",
          userRole: "system",
          type: "document_error",
          description: `Extraction failed: file corrupted or unreadable`,
          target: doc.name,
          caseId,
          detail: corruptionMsg,
        });

        return;
      }
      throw extractError;
    }
    extractionMs = Date.now() - extractionStart;

    log.info("Extraction complete", {
      docId,
      pages: extraction.pages.length,
      totalChars: extraction.totalText.length,
    });

    // ------------------------------------------------------------------
    // 4.5 Handle email attachments (create child documents)
    // ------------------------------------------------------------------
    if (extraction.attachments && extraction.attachments.length > 0) {
      log.info("Email has attachments, creating child documents", {
        docId,
        attachmentCount: extraction.attachments.length,
      });
      for (const att of extraction.attachments) {
        const attExt = path.extname(att.filename).toLowerCase();
        const fileTypeMap: Record<string, string> = {
          ".pdf": "PDF", ".docx": "DOCX", ".xlsx": "XLSX", ".txt": "TXT",
          ".eml": "EML", ".msg": "MSG", ".png": "PNG", ".jpg": "JPG",
          ".jpeg": "JPG", ".pptx": "PPTX",
          ".mp3": "MP3", ".wav": "WAV", ".m4a": "M4A",
          ".mp4": "MP4", ".mov": "MOV", ".avi": "AVI", ".webm": "WEBM",
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
          log.error("Failed to process attachment", {
            docId,
            attachmentFilename: att.filename,
            error: err instanceof Error ? err.message : String(err),
          }),
        );

        log.info("Created child document for attachment", {
          docId,
          attachmentFilename: att.filename,
          childDocId: attDoc.id,
        });
      }
    }

    // ------------------------------------------------------------------
    // 4.6 Format conversion — normalize content to structured review format
    // ------------------------------------------------------------------
    let conversionResult;
    try {
      log.info("Converting to review format", { docId, fileType: doc.fileType });
      conversionResult = convertFromPages(
        extraction.pages,
        doc.fileType,
        doc.name,
      );
      log.info("Format conversion complete", {
        docId,
        reviewPages: conversionResult.pages.length,
        notes: conversionResult.conversionNotes.length,
      });
    } catch (conversionError) {
      // Format conversion is non-critical — log and continue
      log.error("Format conversion failed, continuing without structured content", {
        docId,
        error: conversionError instanceof Error ? conversionError.message : String(conversionError),
      });
      conversionResult = null;
    }

    // ------------------------------------------------------------------
    // 4.7 Document-level classification
    // ------------------------------------------------------------------
    let docClassification: DocumentClassification | null = null;
    try {
      log.info("Running document classification", { docId });
      docClassification = await classifyDocument(extraction.pages);
      log.info("Document classification complete", {
        docId,
        documentType: docClassification.documentType,
        likelyGrounds: docClassification.likelyGrounds,
      });
    } catch (classifyError) {
      // Classification is non-critical — log and continue without it
      log.error("Document classification failed, continuing without context", {
        docId,
        error: classifyError instanceof Error ? classifyError.message : String(classifyError),
      });
    }

    // ------------------------------------------------------------------
    // 5. Store pages in DocumentPage table
    // ------------------------------------------------------------------
    // Wrap in a transaction to prevent race conditions when processing
    // is triggered concurrently (e.g. double-click).
    await prisma.$transaction(async (tx) => {
      await tx.documentPage.deleteMany({ where: { documentId: docId } });
      await tx.documentPage.createMany({
        data: extraction.pages.map((page) => ({
          documentId: docId,
          pageNumber: page.pageNumber,
          text: page.text,
          width: page.width ?? null,
          height: page.height ?? null,
          layoutJson: page.words
            ? JSON.parse(JSON.stringify(page.words))
            : null,
        })),
        skipDuplicates: true,
      });
    });

    // Update document page count
    await prisma.document.update({
      where: { id: docId },
      data: { pageCount: extraction.pages.length },
    });

    // ------------------------------------------------------------------
    // 5.5 Duplicate detection
    // ------------------------------------------------------------------
    log.info("Checking for duplicates", { docId });
    const dupResult = await detectDuplicates(docId, caseId, extraction.totalText);
    if (dupResult.isExactDuplicate) {
      log.info("Exact duplicate detected", { docId, duplicateGroup: dupResult.duplicateGroup });
    } else if (dupResult.nearDuplicateOf) {
      log.info("Near-duplicate detected", {
        docId,
        similarity: Math.round((dupResult.nearDuplicateSimilarity ?? 0) * 100),
      });
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
    const enabledTypes = await getEnabledDetectionTypes();
    log.info("Running pattern detection", { docId, enabledTypes: [...enabledTypes] });
    const patternStart = Date.now();
    const patternMatches = detectPatterns(extraction.pages, enabledTypes);
    patternDetectionMs = Date.now() - patternStart;
    log.info("Pattern detection complete", { docId, matches: patternMatches.length });

    // ------------------------------------------------------------------
    // 6.5 Custom rules detection (WP8)
    // ------------------------------------------------------------------
    let customRuleMatches: Awaited<ReturnType<typeof executeCustomRules>> = [];
    try {
      log.info("Running custom rules", { docId });
      customRuleMatches = await executeCustomRules(extraction.pages);
      log.info("Custom rules complete", { docId, matches: customRuleMatches.length });
    } catch (rulesError) {
      log.error("Custom rules failed, continuing", {
        docId,
        error: rulesError instanceof Error ? rulesError.message : String(rulesError),
      });
    }

    // ------------------------------------------------------------------
    // 7. AI detection
    // ------------------------------------------------------------------
    let aiDetections: Awaited<ReturnType<typeof detectWithAI>> = [];

    try {
      log.info("Running AI detection", { docId });
      const aiStart = Date.now();
      const patternTexts = patternMatches.map((m) => m.text);
      const feedbackPrompt = await buildFeedbackPromptSection();
      aiDetections = await detectWithAI(extraction.pages, patternTexts, feedbackPrompt || undefined, enabledTypes, docClassification || undefined);
      aiDetectionMs = Date.now() - aiStart;
      log.info("AI detection complete", { docId, detections: aiDetections.length });
    } catch (aiError) {
      if (aiError instanceof CircuitOpenError) {
        log.warn("AI detection unavailable, proceeding with pattern detection only", { docId });
      } else {
        // AI detection is non-critical -- log and continue with pattern-only
        log.error("AI detection failed, continuing with pattern-only results", {
          docId,
          error: aiError instanceof Error ? aiError.message : String(aiError),
        });
        trackException(aiError, { docId, stage: "ai-detection" });
      }
    }

    // ------------------------------------------------------------------
    // 7.5 Deduplicate custom rule matches against pattern + AI results
    // ------------------------------------------------------------------
    // Pattern matches take priority, then AI, then custom rules.
    // Drop custom rule detections whose text overlaps with pattern or AI
    // detections on the same page.
    const patternAndAiTexts = new Map<number, string[]>(); // page → texts
    for (const m of patternMatches) {
      const arr = patternAndAiTexts.get(m.page) || [];
      arr.push(m.text);
      patternAndAiTexts.set(m.page, arr);
    }
    for (const d of aiDetections) {
      const arr = patternAndAiTexts.get(d.page) || [];
      arr.push(d.text);
      patternAndAiTexts.set(d.page, arr);
    }

    const dedupedCustomRuleMatches = customRuleMatches.filter((crm) => {
      const pageTexts = patternAndAiTexts.get(crm.page);
      if (!pageTexts) return true;
      const normCrm = crm.text.toLowerCase().trim();
      for (const existing of pageTexts) {
        const normExisting = existing.toLowerCase().trim();
        if (normCrm === normExisting) return false;
        if (normExisting.includes(normCrm) || normCrm.includes(normExisting)) return false;
      }
      return true;
    });

    if (dedupedCustomRuleMatches.length < customRuleMatches.length) {
      log.info("Custom rule dedup removed overlapping matches", {
        docId,
        before: customRuleMatches.length,
        after: dedupedCustomRuleMatches.length,
      });
    }

    // ------------------------------------------------------------------
    // 8. Deduplicate and store detections in DB
    // ------------------------------------------------------------------
    // Delete any existing detections first (in case of reprocessing)
    await prisma.detection.deleteMany({ where: { documentId: docId } });

    // Build a unified detection list from all three sources
    interface UnifiedDetection {
      type: string;
      text: string;
      confidence: number;
      page: number;
      suggestedGround: string | null;
      reasoning: string;
      piConsideration: string;
      aiExplanation: string;
      source: string;
    }

    const allDetections: UnifiedDetection[] = [
      ...patternMatches.map((m) => ({
        type: m.type,
        text: m.text,
        confidence: m.confidence,
        page: m.page,
        suggestedGround: m.suggestedGround,
        reasoning: m.reasoning,
        piConsideration: "",
        aiExplanation: `Pattern-detected ${m.type}. ${m.reasoning}`,
        source: "pattern",
      })),
      ...aiDetections.map((d) => ({
        type: d.type,
        text: d.text,
        confidence: d.confidence,
        page: d.page,
        suggestedGround: d.suggestedGround,
        reasoning: d.reasoning,
        piConsideration: d.piConsideration,
        aiExplanation: d.aiExplanation,
        source: "ai",
      })),
      ...dedupedCustomRuleMatches.map((crm) => ({
        type: crm.type,
        text: crm.text,
        confidence: crm.confidence,
        page: crm.page,
        suggestedGround: crm.suggestedGround,
        reasoning: crm.reasoning,
        piConsideration: "",
        aiExplanation: `Custom rule: ${crm.ruleName}. ${crm.reasoning}`,
        source: "custom-rule",
      })),
    ];

    // Enrich with coordinates BEFORE deduplication to allow multiple instances on the same page
    const enrichedDetections: (UnifiedDetection & { posX: number; posY: number; posW: number; posH: number })[] = [];
    for (const det of allDetections) {
      const layout = pageLayouts.get(det.page);
      const bboxes = layout
        ? calculateBBoxAll(det.text, layout.words, layout.width, layout.height)
        : [{ posX: 0, posY: 0, posW: 0, posH: 0 }];
        
      for (const bbox of bboxes) {
        enrichedDetections.push({ ...det, ...bbox });
      }
    }

    // Deduplicate by (page, type, text, posY_rounded). Keep the entry with highest confidence.
    const beforeDedup = enrichedDetections.length;
    const seen = new Map<string, number>();
    const dedupedDetections: (UnifiedDetection & { posX: number; posY: number; posW: number; posH: number })[] = [];

    for (const det of enrichedDetections) {
      const posYRounded = Math.round(det.posY * 10) / 10;
      const key = `${det.page}|${det.type}|${det.text.toLowerCase().trim()}|${posYRounded}`;
      const existingIdx = seen.get(key);
      if (existingIdx !== undefined) {
        if (det.confidence > dedupedDetections[existingIdx].confidence) {
          dedupedDetections[existingIdx] = det;
        }
        continue;
      }
      seen.set(key, dedupedDetections.length);
      dedupedDetections.push(det);
    }

    if (beforeDedup !== dedupedDetections.length) {
      log.info("Detection deduplication", {
        docId,
        before: beforeDedup,
        after: dedupedDetections.length,
        removed: beforeDedup - dedupedDetections.length,
      });
    }

    // Insert deduplicated detections
    const allDetectionRecords = [];
    for (const det of dedupedDetections) {
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
          source: det.source,
          status: "pending",
          posX: det.posX,
          posY: det.posY,
          posW: det.posW,
          posH: det.posH,
        },
      });
      allDetectionRecords.push(record);
    }

    const totalDetections = allDetectionRecords.length;

    log.info("Detections stored", {
      docId,
      total: totalDetections,
      beforeDedup,
    });

    // ------------------------------------------------------------------
    // 9. Build content for review UI
    // ------------------------------------------------------------------
    log.info("Building content structure for review UI", { docId });

    const contentDetections = allDetectionRecords.map((r) => ({
      id: r.id,
      type: r.type,
      text: r.text,
      page: r.page,
      confidence: r.confidence,
      suggestedGround: r.suggestedGround,
    }));

    // For DOCX files, use structured content from mammoth HTML conversion
    // to preserve headings, lists, and other document structure.
    // All other formats use the plain-text buildContent() path.
    let content;
    if (doc.fileType.toUpperCase() === "DOCX") {
      try {
        const structured = await convertToReviewFormat(buffer, doc.fileType, doc.name);
        if (structured.pages.length > 0 && structured.pages[0].structuredContent.length > 0) {
          const blocks = structured.pages[0].structuredContent;
          content = buildContentFromBlocks(blocks, contentDetections, 1);
          verifyDetectionCoverage(content, contentDetections);
          log.info("Built structured DOCX content", {
            docId,
            blocks: blocks.length,
            paragraphs: content.length,
          });
        } else {
          content = buildContent(extraction.pages, contentDetections);
          log.info("DOCX structured conversion produced no blocks, using plain text fallback", { docId });
        }
      } catch (structuredErr) {
        log.warn("Structured DOCX content failed, falling back to plain text", {
          docId,
          error: structuredErr instanceof Error ? structuredErr.message : String(structuredErr),
        });
        content = buildContent(extraction.pages, contentDetections);
      }
    } else {
      content = buildContent(extraction.pages, contentDetections);
    }

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
          classification: docClassification
            ? JSON.parse(JSON.stringify(docClassification))
            : undefined,
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
        `Pattern detections: ${patternMatches.length}`,
        `AI detections: ${aiDetections.length}`,
        `Custom rule detections: ${dedupedCustomRuleMatches.length}`,
        `After dedup: ${totalDetections}`,
        `Average confidence: ${Math.round(avgConfidence)}%`,
        `Processing time: ${(totalProcessingMs / 1000).toFixed(1)}s (extraction: ${(extractionMs / 1000).toFixed(1)}s, patterns: ${patternDetectionMs}ms, AI: ${(aiDetectionMs / 1000).toFixed(1)}s)`,
      ].join("; "),
    });

    // Recompute case status (ingesting -> in-review when all docs ready)
    await recomputeCaseStatus(caseId);

    log.info("Document processing complete", { docId, totalProcessingMs });
    trackEvent("document_processed", { docId });
    trackMetric("pipeline.duration_ms", totalProcessingMs);
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
    } else if (rawMessage.includes("corrupted") || rawMessage.includes("corrupt") || rawMessage.includes("unreadable")) {
      userMessage = `File is corrupted or unreadable. ${rawMessage.slice(0, 200)}`;
    } else if (rawMessage.includes("password") || rawMessage.includes("encrypted")) {
      userMessage = `File is password-protected or encrypted. Please remove protection and re-upload.`;
    } else if (rawMessage.includes("unsupported") || rawMessage.includes("Unsupported")) {
      userMessage = `Unsupported file format. ${rawMessage}`;
    } else {
      userMessage = `Processing failed: ${rawMessage.slice(0, 200)}`;
    }

    log.error("Processing failed", { docId, error: rawMessage });
    trackException(error, { docId, stage: "pipeline" });

    try {
      await prisma.document.update({
        where: { id: docId },
        data: {
          status: "error",
          processingError: userMessage.slice(0, 2000),
        },
      });
    } catch (updateErr) {
      log.error("Failed to update error status", {
        docId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }
  }
}
