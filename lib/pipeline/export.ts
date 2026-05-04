/**
 * Export package assembler.
 *
 * Assembles a single ZIP package per export job. Layout:
 *   redacted/{originalFilename}.pdf      — one per document
 *   redaction-schedule.pdf                — per-type detection summary
 *   audit-timeline.pdf                    — per-document handling timeline
 *   audit-log.pdf                         — full immutable audit trail
 *   audit-log.csv                         — same trail as RFC-4180 CSV
 *   verification-report.txt               — post-redaction verification summary
 *   manifest.json                         — generator + content metadata
 *
 * Export progress is persisted to the database (ExportJob model) so
 * state survives container restarts on Azure App Service. Phase 7
 * collapsed the previous LGOIMA-flavoured packageType tri-state
 * (requester / internal / ombudsman) into a single layout.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { buildRedactedPdf } from "./redact-pdf";
import { verifyRedactedPdf, type VerificationResult } from "./verify-redaction";
import { buildRedactionSchedule } from "./redaction-schedule";
import { buildAuditTrailPdf } from "./audit-pdf";
import { buildAuditTimeline } from "./audit-timeline";
import { assembleZip } from "./zip";
import { logger } from "@/lib/logger";

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

/**
 * Phase 12.6b — well-known checkpoint labels emitted by `doGenerate`
 * via `setProgress`. Per-document stages (`Redacting: {name}` /
 * `Verifying: {name}`) are constructed dynamically and aren't listed
 * here. The ingest-side step-meter (and any future export-step UI)
 * uses this list as the source of truth for what fixed stages exist
 * and in what order.
 *
 * Order is meaningful: the UI maps each label to a fraction of the
 * total bar. New stages should be inserted at the position they fire
 * in `doGenerate`, not appended.
 */
export const EXPORT_STAGE_LABELS = [
  "Preparing export",
  "Generating redaction schedule",
  "Generating audit timeline",
  "Generating audit log",
  "Assembling ZIP package",
  "Computing integrity hash",
  "Uploading to storage",
  "Export complete",
] as const;

export type ExportStageLabel = (typeof EXPORT_STAGE_LABELS)[number];

interface DocResult {
  docId: string;
  docName: string;
  success: boolean;
  error?: string;
  fallback?: boolean;
}

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
 * Generate an export package asynchronously. Returns the exportId
 * immediately; poll getExportProgress() for status.
 */
export async function generateExportPackage(
  batchId: string,
  options: { generatedBy?: string } = {},
): Promise<string> {
  const job = await prisma.exportJob.create({
    data: {
      batchId,
      status: "generating",
      progress: 0,
      currentStep: "Preparing export",
    },
  });

  const exportId = job.id;

  doGenerate(exportId, batchId, options).catch((err) => {
    logger.error("Export generation failed:", { error: String(err) });
    setProgress(exportId, {
      status: "error",
      error: err instanceof Error ? err.message : "Export failed",
    });
  });

  return exportId;
}

async function doGenerate(
  exportId: string,
  batchId: string,
  options: { generatedBy?: string },
) {
  const batchData = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });

  const documents = await prisma.document.findMany({
    where: { batchId, status: { in: ["signed-off", "reviewed"] } },
    orderBy: { name: "asc" },
  });

  const totalSteps = documents.length + 4; // docs + schedule + audit-timeline + audit + finalize
  let completed = 0;

  const storage = getStorage();
  const zipParts: { name: string; data: Buffer | Uint8Array }[] = [];
  const verificationResults: Array<{ docName: string; result: VerificationResult }> = [];
  const docResults: DocResult[] = [];

  // 1. Redact + verify each document
  for (const doc of documents) {
    await setProgress(exportId, {
      progress: Math.round((completed / totalSteps) * 80),
      currentStep: `Redacting: ${doc.name}`,
    });

    try {
      const result = await buildRedactedPdf(doc.id);
      const pdfName = doc.name.replace(/\.[^.]+$/, "") + ".pdf";
      zipParts.push({ name: `redacted/${pdfName}`, data: result.pdfBytes });

      docResults.push({ docId: doc.id, docName: doc.name, success: true });

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
        logger.warn(
          `[export] Redaction verification warning for ${doc.name}: ${verification.leaksFound} issue(s) found`,
        );
        for (const detail of verification.details.filter((d) => d.leaked)) {
          logger.warn(`  - ${detail.detectionText}: ${detail.note}`);
        }
      }
    } catch (err) {
      logger.error(`Failed to redact ${doc.name}:`, { error: String(err) });
      docResults.push({
        docId: doc.id,
        docName: doc.name,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
    completed++;
  }

  await setProgress(exportId, { docResults });

  // 2. Redaction schedule
  await setProgress(exportId, {
    progress: Math.round((completed / totalSteps) * 80),
    currentStep: "Generating redaction schedule",
  });
  const selectedDocIds = documents.map((d) => d.id);
  const schedule = await buildRedactionSchedule(batchId, {
    includeReasoning: true,
    documentIds: selectedDocIds,
  });
  zipParts.push({ name: `redaction-schedule.pdf`, data: schedule.pdfBytes });
  completed++;

  // 3. Audit timeline (per-document handling)
  await setProgress(exportId, {
    progress: Math.round((completed / totalSteps) * 80),
    currentStep: "Generating audit timeline",
  });
  const timeline = await buildAuditTimeline(batchId, options.generatedBy ?? "System");
  zipParts.push({ name: `audit-timeline.pdf`, data: timeline.pdfBytes });
  completed++;

  // 4. Audit log — PDF + CSV (full immutable trail)
  await setProgress(exportId, {
    progress: Math.round((completed / totalSteps) * 80),
    currentStep: "Generating audit log",
  });
  const auditPdf = await buildAuditTrailPdf(batchId);
  zipParts.push({ name: `audit-log.pdf`, data: auditPdf });
  const auditCsv = await buildAuditLogCsv(batchId);
  zipParts.push({ name: `audit-log.csv`, data: Buffer.from(auditCsv, "utf-8") });
  completed++;

  // 5. Verification report
  if (verificationResults.length > 0) {
    const allPassed = verificationResults.every((v) => v.result.passed);
    const verifyLines: string[] = [
      `Redaction Verification Report`,
      `Generated: ${new Date().toISOString()}`,
      `Batch: ${batchData.reference}`,
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
      name: `verification-report.txt`,
      data: Buffer.from(verifyLines.join("\n"), "utf-8"),
    });

    await prisma.auditEntry.create({
      data: {
        userName: "Umbra",
        userRole: "system",
        type: "redaction-verification",
        description: allPassed
          ? `Redaction verification passed for ${verificationResults.length} document(s)`
          : `Redaction verification completed with warnings for ${verificationResults.filter((v) => !v.result.passed).length} of ${verificationResults.length} document(s)`,
        target: batchData.reference,
        batchId,
        detail: verificationResults
          .map((v) => `${v.docName}: ${v.result.passed ? "PASS" : `${v.result.leaksFound} issue(s)`}`)
          .join("; "),
      },
    });
  }

  // 6. Manifest
  const manifest = {
    batchReference: batchData.reference,
    generatedAt: new Date().toISOString(),
    generatedBy: options.generatedBy ?? "System",
    documents: docResults.map((d) => ({
      docId: d.docId,
      docName: d.docName,
      success: d.success,
      error: d.error,
    })),
    contents: zipParts.map((p) => p.name),
  };
  zipParts.push({
    name: `manifest.json`,
    data: Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"),
  });

  // 7. Assemble ZIP
  await setProgress(exportId, {
    status: "verifying",
    progress: 85,
    currentStep: "Assembling ZIP package",
  });

  const zipBuffer = await assembleZip(zipParts);

  // 8. SHA-256
  await setProgress(exportId, {
    progress: 95,
    currentStep: "Computing integrity hash",
  });
  const sha256 = createHash("sha256").update(zipBuffer).digest("hex");

  // 9. Persist
  // Phase 12.6b — explicit "Uploading to storage" checkpoint so the
  // batch detail step-meter shows a final visible stage between the
  // 95% integrity hash and the 100% completion (the storage.upload
  // call below can take several seconds for large ZIPs against
  // Azure Blob).
  await setProgress(exportId, {
    progress: 98,
    currentStep: "Uploading to storage",
  });
  const filename = `${batchData.reference}_${new Date().toISOString().split("T")[0]}.zip`;
  const storageKey = `exports/${batchId}/${exportId}/${filename}`;
  await storage.upload(storageKey, zipBuffer, "application/zip");

  // 10. Audit
  await prisma.auditEntry.create({
    data: {
      userName: "System",
      userRole: "system",
      type: "export-generated",
      description: `Export package generated: ${filename}`,
      target: batchData.reference,
      batchId,
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

/**
 * RFC-4180 CSV escape: cells containing comma, CR, LF, or double-quote
 * are wrapped in double quotes, and embedded double-quotes are doubled.
 */
function csvEscape(value: string): string {
  if (value === "") return "";
  const needsQuoting = /[",\r\n]/.test(value);
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

async function buildAuditLogCsv(batchId: string): Promise<string> {
  const entries = await prisma.auditEntry.findMany({
    where: { batchId },
    orderBy: { timestamp: "asc" },
  });

  const header = [
    "timestamp",
    "userName",
    "userRole",
    "type",
    "description",
    "target",
    "batchId",
    "detail",
    "integrityHash",
    "previousHash",
  ].join(",");

  const rows = entries.map((e) =>
    [
      e.timestamp.toISOString(),
      csvEscape(e.userName),
      csvEscape(e.userRole),
      csvEscape(e.type),
      csvEscape(e.description),
      csvEscape(e.target ?? ""),
      csvEscape(e.batchId ?? ""),
      csvEscape(e.detail ?? ""),
      csvEscape(e.integrityHash ?? ""),
      csvEscape(e.previousHash ?? ""),
    ].join(","),
  );

  return [header, ...rows].join("\r\n") + "\r\n";
}
