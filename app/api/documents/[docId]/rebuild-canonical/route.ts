/**
 * POST /api/documents/[docId]/rebuild-canonical
 *
 * Admin-only, idempotent canonical-PDF rebuild for a single document.
 *
 * - First call: invokes buildCanonicalPdf, persists at
 *   {caseId}/{docId}/canonical.pdf, writes the five canonical_pdf_*
 *   Document columns, returns 200 { status: "built", … }.
 * - Second call: detects canonicalPdfPath already set and returns 200
 *   { status: "already-built", … } without re-running the build. No
 *   force-rebuild override is provided — see viewer-rework plan Phase 2
 *   for the reprocess flow that will eventually replace this endpoint's
 *   build logic.
 *
 * Errors:
 *   403 — non-admin caller, or admin without access to the document's case
 *   404 — document not found
 *   422 — document fileType is not in the canonical-PDF supported set
 *   500 — unexpected build failure (see response body for reason)
 */

import { requireCsrfHeader } from "@/lib/csrf";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin, authorizeForDocument } from "@/lib/auth/authorize";
import { applyRateLimit } from "@/lib/api-utils";
import { getStorage } from "@/lib/storage";
import {
  buildCanonicalPdf,
  isCanonicalPdfSupported,
} from "@/lib/pipeline/canonical-pdf";
import { logger } from "@/lib/logger";
import { trackException } from "@/lib/telemetry";

const log = logger.child({
  module: "api",
  route: "/api/documents/rebuild-canonical",
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const csrfError = requireCsrfHeader(request);
  if (csrfError) return csrfError;

  try {
    const { docId } = await params;
    const user = await requireUser();

    // Rate limit — admin maintenance call, tight budget is fine.
    const rateLimitResponse = applyRateLimit(`rebuild-canonical:${user.id}`, 30);
    if (rateLimitResponse) return rateLimitResponse;

    await requireAdmin(user);
    await authorizeForDocument(user, docId);

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) {
      return NextResponse.json(
        { status: "not-found", reason: "Document not found" },
        { status: 404 },
      );
    }

    // Idempotent — short-circuit without rebuilding.
    if (doc.canonicalPdfPath) {
      return NextResponse.json(
        {
          status: "already-built",
          canonicalPdfPath: doc.canonicalPdfPath,
          canonicalPdfSha256: doc.canonicalPdfSha256,
        },
        { status: 200 },
      );
    }

    if (!isCanonicalPdfSupported(doc.fileType)) {
      return NextResponse.json(
        {
          status: "unsupported",
          reason: `unsupported file type: ${doc.fileType.toLowerCase()}`,
        },
        { status: 422 },
      );
    }

    if (!doc.originalPath) {
      return NextResponse.json(
        {
          status: "error",
          reason: "Document has no original file path to build from",
        },
        { status: 500 },
      );
    }

    const storage = getStorage();
    const originalBuffer = await storage.download(doc.originalPath);

    const result = await buildCanonicalPdf(
      { id: doc.id, fileType: doc.fileType },
      originalBuffer,
    );

    const canonicalKey = `${doc.caseId}/${doc.id}/canonical.pdf`;
    await storage.upload(canonicalKey, result.pdfBuffer, "application/pdf");

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        canonicalPdfPath: canonicalKey,
        canonicalPdfSha256: result.sha256,
        canonicalPdfPageCount: result.pageCount,
        canonicalPdfBuildMs: result.durationMs,
        canonicalPdfSource: result.source,
      },
    });

    log.info("Canonical PDF rebuilt via admin endpoint", {
      docId,
      source: result.source,
      pageCount: result.pageCount,
      durationMs: result.durationMs,
    });

    return NextResponse.json(
      {
        status: "built",
        canonicalPdfPath: canonicalKey,
        canonicalPdfSha256: result.sha256,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "Document not found") {
      return NextResponse.json(
        { status: "not-found", reason: message },
        { status: 404 },
      );
    }
    if (message.startsWith("Access denied")) {
      return NextResponse.json(
        { status: "forbidden", reason: message },
        { status: 403 },
      );
    }

    log.error("Rebuild canonical failed", { error: message });
    trackException(error, {
      route: "/api/documents/rebuild-canonical",
    });
    return NextResponse.json({ status: "error", reason: message }, { status: 500 });
  }
}
