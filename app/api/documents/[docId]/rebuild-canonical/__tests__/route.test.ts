import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Module-level mocks ---------------------------------------------------

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth/authorize", () => ({
  requireAdmin: vi.fn(),
  authorizeForDocument: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    document: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-utils", () => ({
  applyRateLimit: vi.fn(() => null), // rate limit never trips in tests
}));

const storageUploadMock = vi.fn();
const storageDownloadMock = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    upload: storageUploadMock,
    download: storageDownloadMock,
  }),
}));

// Keep isCanonicalPdfSupported real; stub buildCanonicalPdf only.
vi.mock("@/lib/pipeline/canonical-pdf", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/pipeline/canonical-pdf")>();
  return {
    ...actual,
    buildCanonicalPdf: vi.fn(),
  };
});

// Telemetry / CSRF / logger are safe to let run unmocked.

// --- Imports under test (after mocks) -------------------------------------

import { POST } from "../route";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin, authorizeForDocument } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { buildCanonicalPdf } from "@/lib/pipeline/canonical-pdf";

const requireUserMock = vi.mocked(requireUser);
const requireAdminMock = vi.mocked(requireAdmin);
const authorizeForDocumentMock = vi.mocked(authorizeForDocument);
const findUniqueMock = vi.mocked(prisma.document.findUnique);
const updateMock = vi.mocked(prisma.document.update);
const buildCanonicalPdfMock = vi.mocked(buildCanonicalPdf);

function makeRequest(): NextRequest {
  return new NextRequest(
    "http://localhost/api/documents/doc-1/rebuild-canonical",
    {
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
    },
  );
}

describe("POST /api/documents/[docId]/rebuild-canonical", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when requireAdmin rejects a reviewer", async () => {
    requireUserMock.mockResolvedValue({
      id: "u-rev",
      name: "Reviewer",
      email: "r@x",
      role: "reviewer",
    });
    requireAdminMock.mockRejectedValue(
      new Error("Access denied: admin role required"),
    );

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ docId: "doc-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.status).toBe("forbidden");
    expect(body.reason).toMatch(/Access denied/);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(buildCanonicalPdfMock).not.toHaveBeenCalled();
  });

  it("returns 404 when authorizeForDocument reports Document not found", async () => {
    requireUserMock.mockResolvedValue({
      id: "u-adm",
      name: "Admin",
      email: "a@x",
      role: "admin",
    });
    requireAdminMock.mockResolvedValue(undefined);
    authorizeForDocumentMock.mockRejectedValue(
      new Error("Document not found"),
    );

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ docId: "doc-missing" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.status).toBe("not-found");
    expect(body.reason).toBe("Document not found");
  });

  it("returns 422 for a document with unsupported fileType", async () => {
    requireUserMock.mockResolvedValue({
      id: "u-adm",
      name: "Admin",
      email: "a@x",
      role: "admin",
    });
    requireAdminMock.mockResolvedValue(undefined);
    authorizeForDocumentMock.mockResolvedValue("case-1");
    findUniqueMock.mockResolvedValue({
      id: "doc-1",
      caseId: "case-1",
      fileType: "xyz",
      canonicalPdfPath: null,
      originalPath: "case-1/doc-1/original.xyz",
    } as never);

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ docId: "doc-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.status).toBe("unsupported");
    expect(body.reason).toMatch(/unsupported file type: xyz/);
    expect(buildCanonicalPdfMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("returns 200 'built' on first call and writes all five canonical_pdf_* columns", async () => {
    requireUserMock.mockResolvedValue({
      id: "u-adm",
      name: "Admin",
      email: "a@x",
      role: "admin",
    });
    requireAdminMock.mockResolvedValue(undefined);
    authorizeForDocumentMock.mockResolvedValue("case-1");
    findUniqueMock.mockResolvedValue({
      id: "doc-1",
      caseId: "case-1",
      fileType: "pdf",
      canonicalPdfPath: null,
      originalPath: "case-1/doc-1/original.pdf",
    } as never);
    storageDownloadMock.mockResolvedValue(Buffer.from("%PDF-1.4 original bytes"));
    buildCanonicalPdfMock.mockResolvedValue({
      pdfBuffer: Buffer.from("%PDF-1.4 canonical bytes"),
      source: "original",
      pageCount: 3,
      sha256: "abc123def4567890",
      durationMs: 42,
    });
    updateMock.mockResolvedValue({} as never);

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ docId: "doc-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      status: "built",
      canonicalPdfPath: "case-1/doc-1/canonical.pdf",
      canonicalPdfSha256: "abc123def4567890",
    });

    expect(buildCanonicalPdfMock).toHaveBeenCalledTimes(1);
    expect(buildCanonicalPdfMock).toHaveBeenCalledWith(
      { id: "doc-1", fileType: "pdf" },
      expect.any(Buffer),
    );

    expect(storageUploadMock).toHaveBeenCalledTimes(1);
    expect(storageUploadMock).toHaveBeenCalledWith(
      "case-1/doc-1/canonical.pdf",
      expect.any(Buffer),
      "application/pdf",
    );

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArgs = updateMock.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.where).toEqual({ id: "doc-1" });
    expect(updateArgs.data).toMatchObject({
      canonicalPdfPath: "case-1/doc-1/canonical.pdf",
      canonicalPdfSha256: "abc123def4567890",
      canonicalPdfPageCount: 3,
      canonicalPdfBuildMs: 42,
      canonicalPdfSource: "original",
    });
  });

  it("returns 200 'already-built' on second call; DB, storage, and build are NOT invoked", async () => {
    requireUserMock.mockResolvedValue({
      id: "u-adm",
      name: "Admin",
      email: "a@x",
      role: "admin",
    });
    requireAdminMock.mockResolvedValue(undefined);
    authorizeForDocumentMock.mockResolvedValue("case-1");
    findUniqueMock.mockResolvedValue({
      id: "doc-1",
      caseId: "case-1",
      fileType: "pdf",
      canonicalPdfPath: "case-1/doc-1/canonical.pdf",
      canonicalPdfSha256: "existing-sha256",
      canonicalPdfBuildMs: 42, // would change if a rebuild fired
      originalPath: "case-1/doc-1/original.pdf",
    } as never);

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ docId: "doc-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      status: "already-built",
      canonicalPdfPath: "case-1/doc-1/canonical.pdf",
      canonicalPdfSha256: "existing-sha256",
    });

    // Idempotency invariants: nothing mutated.
    expect(buildCanonicalPdfMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(storageUploadMock).not.toHaveBeenCalled();
    expect(storageDownloadMock).not.toHaveBeenCalled();
  });

  it("returns 403 when CSRF header is missing", async () => {
    // Not one of the user's listed cases but covers the route's first line.
    const req = new NextRequest(
      "http://localhost/api/documents/doc-1/rebuild-canonical",
      { method: "POST" }, // no x-requested-with
    );
    const res = await POST(req, { params: Promise.resolve({ docId: "doc-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 500 when buildCanonicalPdf throws a non-auth error", async () => {
    requireUserMock.mockResolvedValue({
      id: "u-adm",
      name: "Admin",
      email: "a@x",
      role: "admin",
    });
    requireAdminMock.mockResolvedValue(undefined);
    authorizeForDocumentMock.mockResolvedValue("case-1");
    findUniqueMock.mockResolvedValue({
      id: "doc-1",
      caseId: "case-1",
      fileType: "pdf",
      canonicalPdfPath: null,
      originalPath: "case-1/doc-1/original.pdf",
    } as never);
    storageDownloadMock.mockResolvedValue(Buffer.from("%PDF-1.4"));
    buildCanonicalPdfMock.mockRejectedValue(
      new Error("LibreOffice subprocess crashed"),
    );

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ docId: "doc-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.status).toBe("error");
    expect(body.reason).toMatch(/LibreOffice subprocess crashed/);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
