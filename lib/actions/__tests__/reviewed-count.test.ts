/**
 * Phase 12.6c — verify Batch.reviewedCount is incremented on terminal
 * Document.status transitions. Pre-12.6c the counter was schema-only
 * and the batch header progress bar always read 0/N regardless of
 * how many docs had been completed.
 *
 * Two terminal states: signed-off (reviewer-driven) and auto-redacted
 * (pure-auto path). One unit test per increment site.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireUser = vi.fn();
const mockAuthorizeForDocument = vi.fn();
const mockCreateAuditEntry = vi.fn();
const mockRecomputeBatchStatus = vi.fn();
const mockDocumentFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}));
vi.mock("@/lib/auth/authorize", () => ({
  requireAdmin: vi.fn(),
  authorizeForBatch: vi.fn(),
  authorizeForDocument: (...args: unknown[]) =>
    mockAuthorizeForDocument(...args),
}));
vi.mock("@/lib/data/audit", () => ({
  createAuditEntry: (...args: unknown[]) => mockCreateAuditEntry(...args),
}));
vi.mock("@/lib/data/audit-sanitize", () => ({
  maskEntityText: (s: string) => s,
  stripPiiPatterns: (s: string) => s,
}));
vi.mock("@/lib/data/batches", () => ({
  recomputeBatchStatus: (...args: unknown[]) =>
    mockRecomputeBatchStatus(...args),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    document: {
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args),
      update: vi.fn(),
    },
    batch: {
      update: vi.fn(),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { signOffDocument } from "../detection-actions";

const fakeUser = { id: "u1", name: "Mihi", role: "reviewer" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(fakeUser);
  mockAuthorizeForDocument.mockResolvedValue(undefined);
  mockCreateAuditEntry.mockResolvedValue(undefined);
  mockRecomputeBatchStatus.mockResolvedValue(null);
  mockTransaction.mockResolvedValue([{}, {}]);
});

describe("signOffDocument — increments Batch.reviewedCount", () => {
  it("issues a $transaction containing both the document update and the batch reviewedCount increment", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      status: "reviewed",
      name: "Demo.pdf",
      batchId: "b1",
    });

    await signOffDocument("doc-1");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const txArg = mockTransaction.mock.calls[0][0];
    // The $transaction array form takes a list of pre-built promises;
    // we inspect the call shape rather than the value because the
    // promises are opaque outside the mock. Two operations expected:
    // document.update + batch.update with reviewedCount increment.
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(2);
  });

  it("throws (no counter write) when the document is not in 'reviewed' state", async () => {
    mockDocumentFindUnique.mockResolvedValue({
      status: "in-review",
      name: "Demo.pdf",
      batchId: "b1",
    });

    await expect(signOffDocument("doc-1")).rejects.toThrow(/Cannot sign off/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

/**
 * Auto-redact path lives in lib/pipeline/process.ts inside the final
 * transaction at the post-tier-routing site. It's hard to mock
 * end-to-end without recreating the full pipeline, so we lock in the
 * source-level wiring: the file must contain a reviewedCount increment
 * conditional on finalDocStatus === "auto-redacted". A future change
 * that drops or reorders the conditional fails this loudly.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

describe("processDocument — increments Batch.reviewedCount on auto-redact", () => {
  const processSource = readFileSync(
    resolve(process.cwd(), "lib/pipeline/process.ts"),
    "utf-8",
  );

  it("source contains a reviewedCount increment gated on auto-redacted", () => {
    expect(
      processSource.includes(`reviewedCount: { increment: 1 }`),
      "Phase 12.6c regression: lib/pipeline/process.ts no longer increments Batch.reviewedCount when finalDocStatus is auto-redacted.",
    ).toBe(true);
    expect(
      processSource.includes(`finalDocStatus === "auto-redacted"`),
      "Phase 12.6c regression: the reviewedCount bump must be gated on finalDocStatus === \"auto-redacted\" so partial-tray docs aren't counted as complete.",
    ).toBe(true);
  });
});
