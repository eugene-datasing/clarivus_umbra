/**
 * Export-runner — Phase 12.2.
 *
 * High-level orchestration for "produce the export ZIP for a batch".
 * Bundles the validation guards (no blocked-status docs, audit-integrity
 * check) with the existing `generateExportPackage` async kick-off so
 * both the manual user-triggered path (`/api/export/[batchId]/generate`)
 * and the auto-export pg-boss handler call the same function.
 *
 * Web-surface concerns (CSRF, auth, rate limiting, request authorisation)
 * stay in the route handler — this module is concerned only with the
 * "is this batch in a state where export makes sense" decision and the
 * follow-on `generateExportPackage` call.
 */

import { prisma } from "@/lib/db/prisma";
import { generateExportPackage } from "./export";
import { verifyAuditIntegrity } from "@/lib/data/audit";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "pipeline/export-runner" });

export interface ExportRunResult {
  ok: boolean;
  exportId?: string;
  errorCode?:
    | "BATCH_EMPTY"
    | "BLOCKED_DOCS"
    | "AUDIT_INTEGRITY_FAILURE";
  errorMessage?: string;
  blockedDocNames?: string[];
}

/**
 * Validate + kick off an export. Returns the exportId on success or a
 * structured error code the caller can map to a user-facing message
 * or a job-retry decision.
 *
 * Document statuses that BLOCK export (the "still being processed or
 * needs review" set):
 *   - pending, processing, ready, error
 *
 * Document statuses that ALLOW export:
 *   - in-review, reviewed, signed-off, auto-redacted (Phase 12.2)
 */
export async function runExportForBatch(
  batchId: string,
  options: { generatedBy: string },
): Promise<ExportRunResult> {
  const documents = await prisma.document.findMany({
    where: { batchId },
    select: { id: true, name: true, status: true },
  });

  if (documents.length === 0) {
    return {
      ok: false,
      errorCode: "BATCH_EMPTY",
      errorMessage: "Batch has no documents to export",
    };
  }

  const blockedDocs = documents.filter((d) =>
    ["pending", "processing", "ready", "error"].includes(d.status),
  );
  if (blockedDocs.length > 0) {
    return {
      ok: false,
      errorCode: "BLOCKED_DOCS",
      errorMessage: `Cannot export unreviewed documents: ${blockedDocs
        .map((d) => d.name)
        .join(", ")}`,
      blockedDocNames: blockedDocs.map((d) => d.name),
    };
  }

  const auditCheck = await verifyAuditIntegrity(batchId);
  if (!auditCheck.valid) {
    log.error("Audit integrity check failed before export", {
      batchId,
      totalEntries: auditCheck.totalEntries,
      brokenAt: auditCheck.brokenAt,
    });
    return {
      ok: false,
      errorCode: "AUDIT_INTEGRITY_FAILURE",
      errorMessage:
        "Audit trail integrity check failed. The audit chain may have been tampered with. Export blocked — contact an administrator.",
    };
  }

  const exportId = await generateExportPackage(batchId, {
    generatedBy: options.generatedBy,
  });

  log.info("Export run kicked off", {
    batchId,
    exportId,
    generatedBy: options.generatedBy,
    docCount: documents.length,
  });

  return { ok: true, exportId };
}
