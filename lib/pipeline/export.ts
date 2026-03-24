/**
 * Export package assembler.
 *
 * Assembles a ZIP package containing redacted PDFs, withholding schedule,
 * covering letter, and audit trail — depending on the selected package type.
 *
 * Export progress is persisted to the database (ExportJob model) so state
 * survives container restarts on Azure App Service.
 */

import archiver from "archiver";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { buildRedactedPdf } from "./redact-pdf";
import { verifyRedactedPdf, type VerificationResult } from "./verify-redaction";
import { buildWithholdingSchedule } from "./schedule";
import { buildCoverLetterPdf } from "./cover-letter";
import { buildAuditTrailPdf } from "./audit-pdf";
import { buildChainOfCustodyReport } from "./chain-of-custody";
import { sanitiseMetadata } from "./sanitise-metadata";

export type PackageType = "requester" | "internal" | "ombudsman";

export interface ExportProgress {
  status: "pending" | "generating" | "verifying" | "complete" | "error";
  progress: number;
  currentStep: string;
  error?: string;
  downloadKey?: string;
  sha256?: string;
  filename?: string;
  docResults?: DocResult[];
}

interface DocResult {
  docId: string;
  docName: string;
  success: boolean;
  error?: string;
  fallback?: boolean; // true if PDF used text-based fallback
}

// ---------------------------------------------------------------------------
// DB-backed progress helpers
// ---------------------------------------------------------------------------

export async function getExportProgress(exportId: string): Promise<ExportProgress | null> {
  const job = await prisma.exportJob.findUnique({ where: { id: exportId } });
  if (!job) return null;

  return {
    status: job.status as ExportProgress["status"],
    progress: job.progress,
    currentStep: job.currentStep ?? "Initializing",
    error: job.error ?? undefined,
    downloadKey: job.storageKey ?? undefined,
    sha256: job.sha256 ?? undefined,
    filename: job.filename ?? undefined,
    docResults: (job.docResults as DocResult[] | null) ?? undefined,
  };
}

async function setProgress(exportId: string, update: Partial<ExportProgress>) {
  const data: Record<string, unknown> = {};
  if (update.status !== undefined) data.status = update.status;
  if (update.progress !== undefined) data.progress = update.progress;
  if (update.currentStep !== undefined) data.currentStep = update.currentStep;
  if (update.error !== undefined) data.error = update.error;
  if (update.downloadKey !== undefined) data.storageKey = update.downloadKey;
  if (update.sha256 !== undefined) data.sha256 = update.sha256;
  if (update.filename !== undefined) data.filename = update.filename;
  if (update.docResults !== undefined) data.docResults = update.docResults;
  if (update.status === "complete" || update.status === "error") {
    data.completedAt = new Date();
  }

  await prisma.exportJob.update({
    where: { id: exportId },
    data,
  });
}

/**
 * Generate an export package asynchronously.
 * Returns the exportId immediately; use getExportProgress() to poll.
 *
 * @param documentIds - Explicit list of document IDs to include. If omitted,
 *   includes all signed-off documents for the case.
 */
export async function generateExportPackage(
  caseId: string,
  packageType: PackageType,
  options: {
    includeCoverLetter?: boolean;
    includeRightOfReview?: boolean;
    includeChainOfCustody?: boolean;
    documentIds?: string[];
    generatedBy?: string;
  } = {},
): Promise<string> {
  // Create the ExportJob in DB
  const job = await prisma.exportJob.create({
    data: {
      caseId,
      packageType,
      status: "generating",
      progress: 0,
      currentStep: "Preparing export",
      documentIds: options.documentIds ?? [],
    },
  });

  const exportId = job.id;

  // Run async — do not await
  doGenerate(exportId, caseId, packageType, options).catch((err) => {
    console.error("Export generation failed:", err);
    setProgress(exportId, {
      status: "error",
      error: err instanceof Error ? err.message : "Export failed",
    });
  });

  return exportId;
}

async function doGenerate(
  exportId: string,
  caseId: string,
  packageType: PackageType,
  options: {
    includeCoverLetter?: boolean;
    includeRightOfReview?: boolean;
    includeChainOfCustody?: boolean;
    documentIds?: string[];
    generatedBy?: string;
  },
) {
  const caseData = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });

  // If explicit document IDs were provided, use those (already validated by API route).
  // Otherwise fall back to all signed-off documents for the case.
  const documentWhere = options.documentIds
    ? { id: { in: options.documentIds }, caseId }
    : { caseId, status: { in: ["signed-off", "reviewed"] } };

  const documents = await prisma.document.findMany({
    where: documentWhere,
    orderBy: { name: "asc" },
  });

  const totalSteps = documents.length + 3; // docs + schedule + cover letter + finalize
  let completed = 0;

  const storage = getStorage();
  const zipParts: { name: string; data: Buffer | Uint8Array }[] = [];
  const verificationResults: Array<{ docName: string; result: VerificationResult }> = [];
  const docResults: DocResult[] = [];

  // 1. Generate redacted PDFs for each document + verify
  for (const doc of documents) {
    await setProgress(exportId, {
      progress: Math.round((completed / totalSteps) * 80),
      currentStep: `Redacting: ${doc.name}`,
    });

    try {
      const result = await buildRedactedPdf(doc.id);
      const pdfName = doc.name.replace(/\.[^.]+$/, "") + "_redacted.pdf";
      zipParts.push({ name: `documents/${pdfName}`, data: result.pdfBytes });

      docResults.push({ docId: doc.id, docName: doc.name, success: true });

      // Post-redaction verification
      await setProgress(exportId, {
        currentStep: `Verifying: ${doc.name}`,
      });

      const acceptedDetections = await prisma.detection.findMany({
        where: { documentId: doc.id, status: "accepted" },
        select: { text: true, page: true },
      });

      const verification = await verifyRedactedPdf(
        Buffer.from(result.pdfBytes),
        acceptedDetections,
      );
      verificationResults.push({ docName: doc.name, result: verification });

      if (!verification.passed) {
        console.warn(
          `[export] Redaction verification warning for ${doc.name}: ${verification.leaksFound} issue(s) found`,
        );
        for (const detail of verification.details.filter((d) => d.leaked)) {
          console.warn(`  - ${detail.detectionText}: ${detail.note}`);
        }
      }
    } catch (err) {
      console.error(`Failed to redact ${doc.name}:`, err);
      docResults.push({
        docId: doc.id,
        docName: doc.name,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
      // Continue with other documents
    }
    completed++;
  }

  // Persist per-doc results so far
  await setProgress(exportId, { docResults });

  // 2. Generate withholding schedule
  await setProgress(exportId, {
    progress: Math.round((completed / totalSteps) * 80),
    currentStep: "Generating withholding schedule",
  });
  const includeReasoning = packageType === "ombudsman" || packageType === "internal";
  const selectedDocIds = documents.map((d) => d.id);
  const schedule = await buildWithholdingSchedule(caseId, { includeReasoning, documentIds: selectedDocIds });
  zipParts.push({ name: `withholding_schedule.pdf`, data: schedule.pdfBytes });
  completed++;

  // 3. Generate covering letter (if requested)
  if (options.includeCoverLetter !== false) {
    await setProgress(exportId, {
      progress: Math.round((completed / totalSteps) * 80),
      currentStep: "Generating covering letter",
    });
    const coverLetter = await buildCoverLetterPdf(caseId, {
      includeRightOfReview: options.includeRightOfReview !== false,
      documentIds: selectedDocIds,
    });
    zipParts.push({ name: `covering_letter.pdf`, data: coverLetter });
    completed++;
  }

  // 4. Add audit trail for internal and ombudsman packages
  if (packageType === "internal" || packageType === "ombudsman") {
    await setProgress(exportId, {
      progress: Math.round((completed / totalSteps) * 80),
      currentStep: "Generating audit trail",
    });
    const auditPdf = await buildAuditTrailPdf(caseId);
    zipParts.push({ name: `audit_trail.pdf`, data: auditPdf });
  }

  // 4b. Add chain-of-custody report if requested, or for ombudsman/internal packages
  if (options.includeChainOfCustody || packageType === "internal" || packageType === "ombudsman") {
    await setProgress(exportId, {
      progress: Math.round((completed / totalSteps) * 80),
      currentStep: "Generating chain-of-custody report",
    });
    const custodyReport = await buildChainOfCustodyReport(
      caseId,
      options.generatedBy ?? "System",
    );
    zipParts.push({ name: `chain_of_custody.pdf`, data: custodyReport.pdfBytes });
  }

  // 5. For ombudsman, include original files (with metadata sanitised)
  if (packageType === "ombudsman") {
    for (const doc of documents) {
      if (!doc.originalPath) continue;
      try {
        const originalBuffer = await storage.download(doc.originalPath);
        // Strip metadata from Office documents before including (WP15)
        const sanitised = await sanitiseMetadata(originalBuffer, doc.fileType);
        zipParts.push({ name: `originals/${doc.name}`, data: sanitised });
      } catch {
        // Skip if original not found
      }
    }
  }

  // 6. Add verification report
  if (verificationResults.length > 0) {
    const allPassed = verificationResults.every((v) => v.result.passed);
    const verifyLines: string[] = [
      `Redaction Verification Report`,
      `Generated: ${new Date().toISOString()}`,
      `Case: ${caseData.reference}`,
      `Overall: ${allPassed ? "PASSED" : "WARNINGS FOUND"}`,
      ``,
    ];

    for (const { docName, result } of verificationResults) {
      verifyLines.push(`--- ${docName} ---`);
      verifyLines.push(`  Status: ${result.passed ? "PASS" : "WARNING"}`);
      verifyLines.push(`  Detections checked: ${result.totalChecked}`);
      if (result.leaksFound > 0) {
        verifyLines.push(`  Issues: ${result.leaksFound}`);
      }
      for (const detail of result.details) {
        const icon = detail.leaked ? "[!]" : "[OK]";
        verifyLines.push(`  ${icon} ${detail.detectionText} — ${detail.note}`);
      }
      verifyLines.push(``);
    }

    zipParts.push({
      name: `verification_report.txt`,
      data: Buffer.from(verifyLines.join("\n"), "utf-8"),
    });

    // Create verification audit entry
    await prisma.auditEntry.create({
      data: {
        userName: "Veil AI",
        userRole: "system",
        type: "redaction-verification",
        description: allPassed
          ? `Redaction verification passed for ${verificationResults.length} document(s)`
          : `Redaction verification completed with warnings for ${verificationResults.filter((v) => !v.result.passed).length} of ${verificationResults.length} document(s)`,
        target: caseData.reference,
        caseId,
        detail: verificationResults
          .map((v) => `${v.docName}: ${v.result.passed ? "PASS" : `${v.result.leaksFound} issue(s)`}`)
          .join("; "),
      },
    });
  }

  // 7. Assemble ZIP
  await setProgress(exportId, {
    status: "verifying",
    progress: 85,
    currentStep: "Assembling ZIP package",
  });

  const zipBuffer = await assembleZip(zipParts);

  // 8. Compute SHA-256
  await setProgress(exportId, {
    progress: 95,
    currentStep: "Computing integrity hash",
  });
  const sha256 = createHash("sha256").update(zipBuffer).digest("hex");

  // 9. Store the ZIP
  const filename = `${caseData.reference}_${packageType}_${new Date().toISOString().split("T")[0]}.zip`;
  const storageKey = `exports/${caseId}/${exportId}/${filename}`;
  await storage.upload(storageKey, zipBuffer, "application/zip");

  // 10. Audit entry
  await prisma.auditEntry.create({
    data: {
      userName: "System",
      userRole: "system",
      type: "export-generated",
      description: `${packageType} export package generated: ${filename}`,
      target: caseData.reference,
      caseId,
      detail: `SHA-256: ${sha256}`,
    },
  });

  await setProgress(exportId, {
    status: "complete",
    progress: 100,
    currentStep: "Export complete",
    downloadKey: storageKey,
    sha256,
    filename,
    docResults,
  });
}

/* ------------------------------------------------------------------ */
/*  Batch export support                                               */
/* ------------------------------------------------------------------ */

export interface BatchExportProgress {
  status: "pending" | "generating" | "complete" | "error";
  progress: number;
  currentStep: string;
  error?: string;
  batches: {
    batchNumber: number;
    exportId: string;
    status: "pending" | "generating" | "complete" | "error";
    downloadKey?: string;
    sha256?: string;
    filename?: string;
    pageCount: number;
    docCount: number;
  }[];
  totalBatches: number;
}

export async function getBatchExportProgress(batchGroupId: string): Promise<BatchExportProgress | null> {
  const jobs = await prisma.exportJob.findMany({
    where: { batchGroupId },
    orderBy: { batchNumber: "asc" },
  });

  if (jobs.length === 0) return null;

  const batches = jobs.map((job) => ({
    batchNumber: job.batchNumber ?? 1,
    exportId: job.id,
    status: job.status as "pending" | "generating" | "complete" | "error",
    downloadKey: job.storageKey ?? undefined,
    sha256: job.sha256 ?? undefined,
    filename: job.filename ?? undefined,
    pageCount: 0, // We don't track this per-job currently
    docCount: Array.isArray(job.documentIds) ? (job.documentIds as string[]).length : 0,
  }));

  const allComplete = jobs.every((j) => j.status === "complete");
  const anyError = jobs.some((j) => j.status === "error");
  const overallStatus = allComplete ? "complete" : anyError ? "error" : "generating";

  // Progress: average of individual job progress
  const avgProgress = jobs.length > 0
    ? Math.round(jobs.reduce((sum, j) => sum + j.progress, 0) / jobs.length)
    : 0;

  // Current step: first non-complete job's step, or "Batch export complete"
  const activeJob = jobs.find((j) => j.status !== "complete" && j.status !== "error");
  const currentStep = activeJob?.currentStep ?? (allComplete ? "Batch export complete" : "Processing batches");
  const errorMsg = anyError
    ? jobs.find((j) => j.status === "error")?.error ?? undefined
    : undefined;

  return {
    status: overallStatus,
    progress: avgProgress,
    currentStep,
    error: errorMsg,
    batches,
    totalBatches: jobs.length,
  };
}

/**
 * Split documents into page-based batches. Default threshold is 500 pages per batch.
 */
function splitIntoBatches(
  documents: { id: string; name: string; pageCount: number }[],
  maxPagesPerBatch: number,
): { id: string; name: string; pageCount: number }[][] {
  const batches: { id: string; name: string; pageCount: number }[][] = [];
  let currentBatch: { id: string; name: string; pageCount: number }[] = [];
  let currentPageCount = 0;

  for (const doc of documents) {
    // If adding this doc would exceed the limit and we already have docs in the batch,
    // start a new batch. Always allow at least one doc per batch.
    if (currentBatch.length > 0 && currentPageCount + doc.pageCount > maxPagesPerBatch) {
      batches.push(currentBatch);
      currentBatch = [];
      currentPageCount = 0;
    }
    currentBatch.push(doc);
    currentPageCount += doc.pageCount;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Generate a batch export. Splits documents into page-based batches
 * and generates a separate ZIP for each batch.
 *
 * Returns the batchGroupId immediately; use getBatchExportProgress() to poll.
 *
 * If total pages fall below the batch threshold, falls back to a single-batch export.
 */
export async function batchExport(
  caseId: string,
  packageType: PackageType,
  options: {
    includeCoverLetter?: boolean;
    includeRightOfReview?: boolean;
    includeChainOfCustody?: boolean;
    documentIds?: string[];
    generatedBy?: string;
    maxPagesPerBatch?: number;
  } = {},
): Promise<{ batchGroupId: string; exportIds: string[] }> {
  const maxPages = options.maxPagesPerBatch ?? 500;
  const batchGroupId = `bgrp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Fetch documents with page counts
  const documentWhere = options.documentIds
    ? { id: { in: options.documentIds }, caseId }
    : { caseId, status: { in: ["signed-off", "reviewed"] } };

  const documents = await prisma.document.findMany({
    where: documentWhere,
    orderBy: { name: "asc" },
    select: { id: true, name: true, pageCount: true },
  });

  const totalPages = documents.reduce((sum, d) => sum + (d.pageCount ?? 0), 0);

  // If total pages < threshold, produce a single ZIP (existing behavior)
  if (totalPages <= maxPages) {
    // Create a single ExportJob with batchGroupId
    const job = await prisma.exportJob.create({
      data: {
        caseId,
        packageType,
        status: "generating",
        progress: 0,
        currentStep: "Generating single package (below batch threshold)",
        documentIds: options.documentIds ?? [],
        batchGroupId,
        batchNumber: 1,
      },
    });

    // Run standard generation on this job
    doGenerate(job.id, caseId, packageType, options).catch((err) => {
      console.error("Export generation failed:", err);
      setProgress(job.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Export failed",
      });
    });

    return { batchGroupId, exportIds: [job.id] };
  }

  // Split into batches
  const docBatches = splitIntoBatches(
    documents.map((d) => ({ id: d.id, name: d.name, pageCount: d.pageCount ?? 0 })),
    maxPages,
  );

  // Create ExportJob records for each batch
  const exportIds: string[] = [];
  for (let i = 0; i < docBatches.length; i++) {
    const batch = docBatches[i];
    const job = await prisma.exportJob.create({
      data: {
        caseId,
        packageType,
        status: "pending",
        progress: 0,
        currentStep: `Batch ${i + 1}: Waiting`,
        documentIds: batch.map((d) => d.id),
        batchGroupId,
        batchNumber: i + 1,
      },
    });
    exportIds.push(job.id);
  }

  // Run batch generation in background
  doBatchGenerate(batchGroupId, caseId, packageType, docBatches, exportIds, options).catch(
    (err) => {
      console.error("Batch export generation failed:", err);
      // Mark all pending jobs in this batch as errored
      prisma.exportJob.updateMany({
        where: { batchGroupId, status: { not: "complete" } },
        data: { status: "error", error: err instanceof Error ? err.message : "Batch export failed" },
      }).catch(() => {});
    },
  );

  return { batchGroupId, exportIds };
}

async function doBatchGenerate(
  batchGroupId: string,
  caseId: string,
  packageType: PackageType,
  docBatches: { id: string; name: string; pageCount: number }[][],
  exportIds: string[],
  options: {
    includeCoverLetter?: boolean;
    includeRightOfReview?: boolean;
    includeChainOfCustody?: boolean;
    generatedBy?: string;
  },
) {
  const caseData = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });

  for (let i = 0; i < docBatches.length; i++) {
    const batch = docBatches[i];
    const exportId = exportIds[i];

    await setProgress(exportId, {
      status: "generating",
      progress: 0,
      currentStep: `Batch ${i + 1}: Preparing export`,
    });

    try {
      await doGenerate(exportId, caseId, packageType, {
        ...options,
        documentIds: batch.map((d) => d.id),
      });
    } catch (err) {
      await setProgress(exportId, {
        status: "error",
        error: err instanceof Error ? err.message : `Batch ${i + 1} failed`,
      });
      console.error(`Batch ${i + 1} failed:`, err);
    }
  }

  // Store manifest in each batch's storage location
  const storage = getStorage();
  const manifest = {
    caseReference: caseData.reference,
    totalBatches: docBatches.length,
    generatedAt: new Date().toISOString(),
    generatedBy: options.generatedBy ?? "System",
    batches: docBatches.map((batch, i) => ({
      batchNumber: i + 1,
      filename: `${caseData.reference}_batch_${i + 1}.zip`,
      documents: batch.map((d) => d.name),
      pageCount: batch.reduce((s, d) => s + d.pageCount, 0),
    })),
  };
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8");

  for (const eid of exportIds) {
    const job = await prisma.exportJob.findUnique({ where: { id: eid } });
    if (job?.storageKey) {
      const manifestKey = job.storageKey.replace(/[^/]+\.zip$/, "export-manifest.json");
      try {
        await storage.upload(manifestKey, manifestBuffer, "application/json");
      } catch {
        // Non-critical — manifest storage is best-effort
      }
    }
  }
}

/**
 * Assemble a ZIP buffer from named parts.
 */
function assembleZip(parts: { name: string; data: Buffer | Uint8Array }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    for (const part of parts) {
      archive.append(Buffer.from(part.data), { name: part.name });
    }

    archive.finalize();
  });
}
