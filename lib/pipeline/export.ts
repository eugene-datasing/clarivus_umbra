/**
 * Export package assembler.
 *
 * Assembles a ZIP package containing redacted PDFs, withholding schedule,
 * covering letter, and audit trail — depending on the selected package type.
 */

import archiver from "archiver";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { buildRedactedPdf } from "./redact-pdf";
import { buildWithholdingSchedule } from "./schedule";
import { buildCoverLetterPdf } from "./cover-letter";
import { buildAuditTrailPdf } from "./audit-pdf";

export type PackageType = "requester" | "internal" | "ombudsman";

export interface ExportProgress {
  status: "pending" | "generating" | "verifying" | "complete" | "error";
  progress: number;
  currentStep: string;
  error?: string;
  downloadKey?: string;
  sha256?: string;
  filename?: string;
}

// In-memory progress store using globalThis to survive module re-imports in dev
const globalForExport = globalThis as unknown as {
  __exportProgressStore?: Map<string, ExportProgress>;
};
if (!globalForExport.__exportProgressStore) {
  globalForExport.__exportProgressStore = new Map<string, ExportProgress>();
}
const progressStore = globalForExport.__exportProgressStore;

export function getExportProgress(exportId: string): ExportProgress | null {
  return progressStore.get(exportId) ?? null;
}

function setProgress(exportId: string, update: Partial<ExportProgress>) {
  const current = progressStore.get(exportId) ?? {
    status: "pending" as const,
    progress: 0,
    currentStep: "Initializing",
  };
  progressStore.set(exportId, { ...current, ...update });
}

/**
 * Generate an export package asynchronously.
 * Returns the exportId immediately; use getExportProgress() to poll.
 */
export async function generateExportPackage(
  caseId: string,
  packageType: PackageType,
  options: {
    includeCoverLetter?: boolean;
    includeRightOfReview?: boolean;
  } = {},
): Promise<string> {
  const exportId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  setProgress(exportId, {
    status: "generating",
    progress: 0,
    currentStep: "Preparing export",
  });

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
  },
) {
  const caseData = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
  const documents = await prisma.document.findMany({
    where: { caseId, status: { in: ["ready", "in-review", "submitted", "complete"] } },
    orderBy: { name: "asc" },
  });

  const totalSteps = documents.length + 3; // docs + schedule + cover letter + finalize
  let completed = 0;

  const storage = getStorage();
  const zipParts: { name: string; data: Buffer | Uint8Array }[] = [];

  // 1. Generate redacted PDFs for each document
  for (const doc of documents) {
    setProgress(exportId, {
      progress: Math.round((completed / totalSteps) * 80),
      currentStep: `Redacting: ${doc.name}`,
    });

    try {
      const result = await buildRedactedPdf(doc.id);
      const pdfName = doc.name.replace(/\.[^.]+$/, "") + "_redacted.pdf";
      zipParts.push({ name: `documents/${pdfName}`, data: result.pdfBytes });
    } catch (err) {
      console.error(`Failed to redact ${doc.name}:`, err);
      // Continue with other documents
    }
    completed++;
  }

  // 2. Generate withholding schedule
  setProgress(exportId, {
    progress: Math.round((completed / totalSteps) * 80),
    currentStep: "Generating withholding schedule",
  });
  const includeReasoning = packageType === "ombudsman" || packageType === "internal";
  const schedule = await buildWithholdingSchedule(caseId, { includeReasoning });
  zipParts.push({ name: `withholding_schedule.pdf`, data: schedule.pdfBytes });
  completed++;

  // 3. Generate covering letter (if requested)
  if (options.includeCoverLetter !== false) {
    setProgress(exportId, {
      progress: Math.round((completed / totalSteps) * 80),
      currentStep: "Generating covering letter",
    });
    const coverLetter = await buildCoverLetterPdf(caseId, {
      includeRightOfReview: options.includeRightOfReview !== false,
    });
    zipParts.push({ name: `covering_letter.pdf`, data: coverLetter });
    completed++;
  }

  // 4. Add audit trail for internal and ombudsman packages
  if (packageType === "internal" || packageType === "ombudsman") {
    setProgress(exportId, {
      progress: Math.round((completed / totalSteps) * 80),
      currentStep: "Generating audit trail",
    });
    const auditPdf = await buildAuditTrailPdf(caseId);
    zipParts.push({ name: `audit_trail.pdf`, data: auditPdf });
  }

  // 5. For ombudsman, include original files
  if (packageType === "ombudsman") {
    for (const doc of documents) {
      if (!doc.originalPath) continue;
      try {
        const originalBuffer = await storage.download(doc.originalPath);
        zipParts.push({ name: `originals/${doc.name}`, data: originalBuffer });
      } catch {
        // Skip if original not found
      }
    }
  }

  // 6. Assemble ZIP
  setProgress(exportId, {
    status: "verifying",
    progress: 85,
    currentStep: "Assembling ZIP package",
  });

  const zipBuffer = await assembleZip(zipParts);

  // 7. Compute SHA-256
  setProgress(exportId, {
    progress: 95,
    currentStep: "Computing integrity hash",
  });
  const sha256 = createHash("sha256").update(zipBuffer).digest("hex");

  // 8. Store the ZIP
  const filename = `${caseData.reference}_${packageType}_${new Date().toISOString().split("T")[0]}.zip`;
  const storageKey = `exports/${caseId}/${exportId}/${filename}`;
  await storage.upload(storageKey, zipBuffer, "application/zip");

  // 9. Audit entry
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

  setProgress(exportId, {
    status: "complete",
    progress: 100,
    currentStep: "Export complete",
    downloadKey: storageKey,
    sha256,
    filename,
  });
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
