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
import { EXPORT_DOCUMENT_STATUSES } from "./export-document-statuses";
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
 * Documents whose status sits outside `EXPORT_DOCUMENT_STATUSES`
 * (pending / processing / ready / error / and any future unknown
 * status) block the run. Excluded docs are filtered out at the
 * findMany boundary so they never enter the consideration set.
 */
export async function runExportForBatch(
  batchId: string,
  options: { generatedBy: string },
): Promise<ExportRunResult> {
  // Phase 12.6c — drop excluded docs at the query boundary; they're
  // out-of-scope for export by definition and shouldn't block on the
  // status check below.
  const documents = await prisma.document.findMany({
    where: { batchId, status: { not: "excluded" } },
    select: { id: true, name: true, status: true },
  });

  if (documents.length === 0) {
    return {
      ok: false,
      errorCode: "BATCH_EMPTY",
      errorMessage: "Batch has no documents to export",
    };
  }

  // Phase 12.6c — switched from blocked-list to allow-list semantics
  // (sourced from EXPORT_DOCUMENT_STATUSES, the same constant the
  // export pipeline uses). Pre-fix this checked a hard-coded blocked
  // list which drifted from the export query; allow-list is stricter
  // and stays in sync via the shared const + contract test.
  const blockedDocs = documents.filter(
    (d) => !(EXPORT_DOCUMENT_STATUSES as readonly string[]).includes(d.status),
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
