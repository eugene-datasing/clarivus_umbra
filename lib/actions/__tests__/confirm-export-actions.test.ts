/**
 * Phase 12.6b — confirm-and-export action.
 *
 * Exercises the gate path: only "auto-redacted" batches can confirm,
 * the pg-boss enqueue and audit entry both fire, deleted batches
 * reject. Authorisation is scoped to authorizeForBatch (reviewer-
 * allowed) — admin-only is asserted to NOT be required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireUser = vi.fn();
const mockAuthorizeForBatch = vi.fn();
const mockCreateAuditEntry = vi.fn();
const mockBossSend = vi.fn();
const mockGetBoss = vi.fn(() => Promise.resolve({ send: mockBossSend }));
const mockRevalidatePath = vi.fn();
const mockBatchFindUnique = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}));
vi.mock("@/lib/auth/authorize", () => ({
  requireAdmin: vi.fn(),
  authorizeForBatch: (...args: unknown[]) => mockAuthorizeForBatch(...args),
}));
vi.mock("@/lib/data/audit", () => ({
  createAuditEntry: (...args: unknown[]) => mockCreateAuditEntry(...args),
}));
vi.mock("@/lib/data/audit-sanitize", () => ({
  maskEntityText: (s: string) => s,
  stripPiiPatterns: (s: string) => s,
}));
vi.mock("@/lib/data/settings", () => ({
  getRetentionConfig: vi.fn(),
  setRetentionConfig: vi.fn(),
  SETTING_KEYS: {} as Record<string, string>,
}));
vi.mock("@/lib/jobs/runner", () => ({
  getBoss: () => mockGetBoss(),
  QUEUE_PURGE_BATCH: "purge-batch",
  QUEUE_AUTO_EXPORT_BATCH: "auto-export-batch",
}));
vi.mock("@/lib/data/batches", () => ({
  getNextReference: vi.fn(async () => "BATCH-2026-099"),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    batch: {
      findUnique: (...args: unknown[]) => mockBatchFindUnique(...args),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import { confirmAndExportBatch } from "../batch-actions";

const fakeReviewer = { id: "u1", name: "Mihi Reviewer", role: "reviewer" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(fakeReviewer);
  mockAuthorizeForBatch.mockResolvedValue(undefined);
  mockCreateAuditEntry.mockResolvedValue(undefined);
  mockBossSend.mockResolvedValue("job-abc-123");
});

describe("confirmAndExportBatch", () => {
  it("enqueues the auto-export job and writes an audit entry on success", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-014",
      status: "auto-redacted",
      deletedAt: null,
    });

    const result = await confirmAndExportBatch("b1");

    expect(result).toEqual({ success: true, jobId: "job-abc-123" });
    expect(mockBossSend).toHaveBeenCalledWith("auto-export-batch", {
      batchId: "b1",
    });
    expect(mockCreateAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "export-confirmed",
        target: "BATCH-2026-014",
        batchId: "b1",
        userRole: "reviewer",
      }),
    );
  });

  it("uses authorizeForBatch (reviewer-allowed), not requireAdmin", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-014",
      status: "auto-redacted",
      deletedAt: null,
    });

    await confirmAndExportBatch("b1");

    expect(mockAuthorizeForBatch).toHaveBeenCalledWith(fakeReviewer, "b1");
  });

  it("throws if the batch is not in auto-redacted state", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-014",
      status: "ready-for-review",
      deletedAt: null,
    });

    await expect(confirmAndExportBatch("b1")).rejects.toThrow(
      /only applies to auto-redacted/i,
    );
    expect(mockBossSend).not.toHaveBeenCalled();
    expect(mockCreateAuditEntry).not.toHaveBeenCalled();
  });

  it("throws if the batch is soft-deleted", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-014",
      status: "auto-redacted",
      deletedAt: new Date(),
    });

    await expect(confirmAndExportBatch("b1")).rejects.toThrow(
      /Cannot export a deleted batch/,
    );
    expect(mockBossSend).not.toHaveBeenCalled();
  });

  it("throws if the batch does not exist", async () => {
    mockBatchFindUnique.mockResolvedValue(null);

    await expect(confirmAndExportBatch("missing")).rejects.toThrow(
      /Batch not found/,
    );
    expect(mockBossSend).not.toHaveBeenCalled();
  });
});
