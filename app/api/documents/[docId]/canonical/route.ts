/**
 * GET /api/documents/[docId]/canonical
 *
 * Admin-only read-only endpoint exposing the canonical_pdf_* columns of
 * a Document. Exists to support the Phase 1 Playwright spec
 * (e2e/canonical-pdf/build.spec.ts) which needs to read canonicalPdfPath
 * + canonicalPdfSha256 + status post-upload without loading the Prisma
 * generated client into the Playwright runner (ESM/CJS loader mismatch
 * when the Playwright Node loader tries to evaluate the generated
 * client.ts files).
 *
 * Response 200:
 *   {
 *     id, status,
 *     canonicalPdfPath, canonicalPdfSha256, canonicalPdfSource,
 *     canonicalPdfPageCount, canonicalPdfBuildMs
 *   }
 * Response 404: { error: "Document not found" }
 * Response 403: via requireAdmin (non-admin) or authorizeForDocument
 *               (admin without access to the case — note that admins
 *               bypass department scoping per lib/auth/authorize.ts:83,
 *               so in practice any admin can read any document's
 *               canonical metadata).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin, authorizeForDocument } from "@/lib/auth/authorize";
import { logger } from "@/lib/logger";

const log = logger.child({
  module: "api",
  route: "/api/documents/canonical",
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const { docId } = await params;
    const user = await requireUser();
    await requireAdmin(user);
    await authorizeForDocument(user, docId);

    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        status: true,
        canonicalPdfPath: true,
        canonicalPdfSha256: true,
        canonicalPdfSource: true,
        canonicalPdfPageCount: true,
        canonicalPdfBuildMs: true,
      },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(doc);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Document not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.startsWith("Access denied")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    log.error("canonical metadata fetch failed", { error: message });
    return NextResponse.json(
      { error: "Failed to fetch canonical metadata" },
      { status: 500 },
    );
  }
}
