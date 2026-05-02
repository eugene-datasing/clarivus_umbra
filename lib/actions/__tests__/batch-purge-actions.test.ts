/**
 * Phase 6b — admin-only soft-delete / restore / purge actions.
 *
 * Mocks the Prisma client + auth + pg-boss runner so we can drive the
 * action paths without touching the DB. The shape of the assertions
 * mirrors `manual-detection-bbox.test.ts` from Phase 5.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireUser = vi.fn();
const mockRequireAdmin = vi.fn();
const mockCreateAuditEntry = vi.fn();
const mockGetRetentionConfig = vi.fn();
const mockBossSend = vi.fn();
const mockGetBoss = vi.fn(() => Promise.resolve({ send: mockBossSend }));
const mockRevalidatePath = vi.fn();

const mockBatchFindUnique = vi.fn();
const mockBatchUpdate = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}));
vi.mock("@/lib/auth/authorize", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));
vi.mock("@/lib/data/audit", () => ({
  createAuditEntry: (...args: unknown[]) => mockCreateAuditEntry(...args),
}));
vi.mock("@/lib/data/audit-sanitize", () => ({
  maskEntityText: (s: string) => s,
  stripPiiPatterns: (s: string) => s,
}));
vi.mock("@/lib/data/settings", () => ({
  getRetentionConfig: (...args: unknown[]) => mockGetRetentionConfig(...args),
  setRetentionConfig: vi.fn(),
  SETTING_KEYS: {} as Record<string, string>,
}));
vi.mock("@/lib/jobs/runner", () => ({
  getBoss: () => mockGetBoss(),
  QUEUE_PURGE_BATCH: "purge-batch",
  QUEUE_RETENTION_SWEEP: "retention-sweep",
}));
vi.mock("@/lib/data/batches", () => ({
  getNextReference: vi.fn(async () => "BATCH-2026-099"),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    batch: {
      findUnique: (...args: unknown[]) => mockBatchFindUnique(...args),
      update: (...args: unknown[]) => mockBatchUpdate(...args),
      create: vi.fn(),
    },
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import {
  softDeleteBatch,
  restoreBatch,
  purgeNowBatch,
} from "../batch-actions";

const fakeUser = { id: "u1", name: "Test Admin", role: "admin" };
const defaultConfig = {
  retentionDaysAfterCompletion: 14,
  gracePeriodDays: 7,
  autoRetentionEnabled: true,
};

function setupDefaults() {
  mockRequireUser.mockResolvedValue(fakeUser);
  mockRequireAdmin.mockResolvedValue(undefined);
  mockCreateAuditEntry.mockResolvedValue(undefined);
  mockGetRetentionConfig.mockResolvedValue(defaultConfig);
  mockBatchUpdate.mockResolvedValue({});
  mockBossSend.mockResolvedValue("job-id-1");
}

// ---------------------------------------------------------------------------
// softDeleteBatch
// ---------------------------------------------------------------------------

describe("softDeleteBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("sets deletedAt + purgeScheduledAt = now + grace, audit-trails", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      deletedAt: null,
      purgeStatus: null,
    });

    const result = await softDeleteBatch("b1");

    expect(mockRequireAdmin).toHaveBeenCalledOnce();
    expect(mockBatchUpdate).toHaveBeenCalledOnce();
    const updateData = mockBatchUpdate.mock.calls[0][0].data;
    expect(updateData.deletedAt).toBeInstanceOf(Date);
    expect(updateData.purgeScheduledAt).toBeInstanceOf(Date);
    const ms =
      updateData.purgeScheduledAt.getTime() - updateData.deletedAt.getTime();
    expect(ms).toBe(7 * 86_400_000);

    expect(mockCreateAuditEntry).toHaveBeenCalledOnce();
    const audit = mockCreateAuditEntry.mock.calls[0][0];
    expect(audit.type).toBe("batch.soft-deleted");
    expect(audit.batchId).toBe("b1");

    expect(result.success).toBe(true);
  });

  it("refuses if batch is already soft-deleted", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      deletedAt: new Date(),
      purgeStatus: null,
    });
    await expect(softDeleteBatch("b1")).rejects.toThrow(/already soft-deleted/);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("refuses if a purge is in flight", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      deletedAt: null,
      purgeStatus: "purging",
    });
    await expect(softDeleteBatch("b1")).rejects.toThrow(/being purged/);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("calls requireAdmin (admin-only gate)", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      deletedAt: null,
      purgeStatus: null,
    });
    await expect(softDeleteBatch("b1")).rejects.toThrow(/forbidden/);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// restoreBatch
// ---------------------------------------------------------------------------

describe("restoreBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("clears deletedAt + purgeScheduledAt, audit-trails", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      deletedAt: new Date(),
      purgeStatus: null,
    });

    await restoreBatch("b1");

    const updateData = mockBatchUpdate.mock.calls[0][0].data;
    expect(updateData.deletedAt).toBeNull();
    expect(updateData.purgeScheduledAt).toBeNull();

    const audit = mockCreateAuditEntry.mock.calls[0][0];
    expect(audit.type).toBe("batch.restored");
  });

  it("refuses if batch is not soft-deleted", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      deletedAt: null,
      purgeStatus: null,
    });
    await expect(restoreBatch("b1")).rejects.toThrow(/not soft-deleted/);
  });

  it("refuses if a purge is in flight (concurrency guard)", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      deletedAt: new Date(),
      purgeStatus: "purging",
    });
    await expect(restoreBatch("b1")).rejects.toThrow(/being purged/);
  });
});

// ---------------------------------------------------------------------------
// purgeNowBatch
// ---------------------------------------------------------------------------

describe("purgeNowBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("default mode: schedules with grace, enqueues purge job", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      purgeStatus: null,
    });

    const result = await purgeNowBatch("b1");

    const updateData = mockBatchUpdate.mock.calls[0][0].data;
    const ms =
      updateData.purgeScheduledAt.getTime() - updateData.deletedAt.getTime();
    expect(ms).toBe(7 * 86_400_000);

    expect(mockBossSend).toHaveBeenCalledOnce();
    const [queue, payload] = mockBossSend.mock.calls[0];
    expect(queue).toBe("purge-batch");
    expect(payload.batchId).toBe("b1");
    expect(payload.skipGrace).toBe(false);
    expect(payload.reason).toBe(null);

    expect(result.skipGrace).toBe(false);
  });

  it("skip-grace mode: scheduled for now, requires reason", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      purgeStatus: null,
    });

    const result = await purgeNowBatch("b1", {
      skipGrace: true,
      reason: "auditor request — destroy now",
    });

    const updateData = mockBatchUpdate.mock.calls[0][0].data;
    expect(updateData.deletedAt.getTime()).toBe(
      updateData.purgeScheduledAt.getTime(),
    );

    const audit = mockCreateAuditEntry.mock.calls[0][0];
    expect(audit.type).toBe("batch.purge-requested");
    expect(audit.detail).toContain("auditor request");

    expect(result.skipGrace).toBe(true);
  });

  it("skip-grace without a reason throws", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      purgeStatus: null,
    });
    await expect(
      purgeNowBatch("b1", { skipGrace: true }),
    ).rejects.toThrow(/reason is required/);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("skip-grace with empty reason throws", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      purgeStatus: null,
    });
    await expect(
      purgeNowBatch("b1", { skipGrace: true, reason: "   " }),
    ).rejects.toThrow(/reason is required/);
  });

  it("refuses if a purge is already in flight", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      purgeStatus: "purging",
    });
    await expect(purgeNowBatch("b1")).rejects.toThrow(/already being purged/);
  });

  it("calls requireAdmin (admin-only gate)", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      purgeStatus: null,
    });
    await expect(purgeNowBatch("b1")).rejects.toThrow(/forbidden/);
  });

  it("if pg-boss enqueue fails, action still returns success (worker will sweep)", async () => {
    mockBatchFindUnique.mockResolvedValue({
      id: "b1",
      reference: "BATCH-2026-001",
      purgeStatus: null,
    });
    mockBossSend.mockRejectedValueOnce(new Error("boss down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await purgeNowBatch("b1");
    expect(result.success).toBe(true);
    errSpy.mockRestore();
  });
});
