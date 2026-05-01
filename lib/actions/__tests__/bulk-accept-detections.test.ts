/**
 * bulkAcceptDetections per-row normalisation contract (Bug 2 root-
 * cause fix, 2026-04-27).
 *
 * Pre-fix: bulkAcceptDetections used `prisma.detection.updateMany`
 * with `appliedGround: validGround || undefined`. When no explicit
 * ground was passed, that left `appliedGround` unchanged on every
 * row — so detections accepted via the bulk path persisted with
 * `appliedGround=null` even when `suggestedGround` was set, suppressing
 * the right-pane citation in the review UI.
 *
 * Post-fix: per-row resolve `validGround → appliedGround → normalised
 * suggestedGround → unchanged` (mirrors `acceptRemainingDetections`),
 * wrapped in a single `prisma.$transaction` for atomicity.
 *
 * The same in-suite mocking pattern as `extend-deadline.test.ts` so
 * we don't pull in the full Prisma client at test time.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireUser = vi.fn();
const mockAuthorizeForCase = vi.fn();
const mockCreateAuditEntry = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}));

vi.mock("@/lib/auth/authorize", () => ({
  authorizeForBatch: (...args: unknown[]) => mockAuthorizeForCase(...args),
  // Other authorize helpers are imported elsewhere in detection-actions
  // but bulkAcceptDetections only calls authorizeForBatch.
  authorizeForDocument: vi.fn(),
  authorizeForDetection: vi.fn(),
}));

vi.mock("@/lib/data/audit", () => ({
  createAuditEntry: (...args: unknown[]) => mockCreateAuditEntry(...args),
}));

vi.mock("@/lib/data/audit-sanitize", () => ({
  maskEntityText: (s: string) => s,
  stripPiiPatterns: (s: string) => s,
}));

vi.mock("@/lib/pipeline/version-snapshot", () => ({
  createSnapshot: vi.fn(),
}));

vi.mock("@/lib/data/batches", () => ({
  recomputeBatchStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockFindMany = vi.fn();
const mockTransaction = vi.fn();
const mockUpdate = vi.fn();
const mockDocumentFindUnique = vi.fn();
const mockDocumentUpdate = vi.fn();

const mockDetectionCount = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    detection: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      // recomputeDocumentStatus calls .count() twice (pending + total)
      // and a benign no-op return suppresses the document.update path
      // (totalCount === 0 short-circuits). The bulk-accept tests
      // don't exercise that branch — they just need the call not to
      // throw.
      count: (...args: unknown[]) => mockDetectionCount(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    document: {
      findUnique: (...args: unknown[]) => mockDocumentFindUnique(...args),
      update: (...args: unknown[]) => mockDocumentUpdate(...args),
    },
    $transaction: (arg: unknown) => mockTransaction(arg),
  },
}));

import { bulkAcceptDetections } from "../detection-actions";

const batchId = "case-1";
const docId = "doc-1";
const fakeUser = { id: "u1", name: "Test User", role: "admin" };

function setupDefaults() {
  mockRequireUser.mockResolvedValue(fakeUser);
  mockAuthorizeForCase.mockResolvedValue(undefined);
  mockCreateAuditEntry.mockResolvedValue(undefined);
  mockDocumentFindUnique.mockResolvedValue({
    id: docId,
    detectionCount: 3,
    status: "in-review",
  });
  mockDocumentUpdate.mockResolvedValue({});
  // $transaction receives the array of update-promises; resolve them
  // all and return the array of results so the caller can read counts.
  // The mocked Prisma `update()` calls below return their `data` arg
  // for inspection.
  mockTransaction.mockImplementation(async (ops: unknown) => {
    if (Array.isArray(ops)) {
      return Promise.all(ops);
    }
    return ops;
  });
  mockUpdate.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
    Promise.resolve({ id: where.id, ...data }),
  );
  // recomputeDocumentStatus's two .count() calls — return zeros so
  // the no-pending branch short-circuits without touching document.
  mockDetectionCount.mockResolvedValue(0);
}

describe("bulkAcceptDetections — per-row appliedGround normalisation (Bug 2 root cause)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("normalises each row's suggestedGround → appliedGround when no explicit ground passed", async () => {
    // Three rows — all pending with suggestedGround set, appliedGround
    // null. Bulk-accept without an explicit ground argument: every
    // row should land with its suggestedGround normalised into
    // appliedGround. This is the regression Bug 2 surfaced.
    mockFindMany.mockResolvedValue([
      {
        id: "d1",
        documentId: docId,
        document: { batchId },
        appliedGround: null,
        suggestedGround: "s7(2)(a)",
      },
      {
        id: "d2",
        documentId: docId,
        document: { batchId },
        appliedGround: null,
        suggestedGround: "s7(2)(ba)",
      },
      {
        id: "d3",
        documentId: docId,
        document: { batchId },
        appliedGround: null,
        suggestedGround: "s6(a)",
      },
    ]);

    const result = await bulkAcceptDetections(["d1", "d2", "d3"]);

    expect(result.count).toBe(3);
    // Each detection got its own .update() with status=accepted and
    // the per-row normalised ground.
    expect(mockUpdate).toHaveBeenCalledTimes(3);
    const callsByid = new Map(
      mockUpdate.mock.calls.map((c) => [c[0].where.id, c[0].data]),
    );
    expect(callsByid.get("d1")).toMatchObject({
      status: "accepted",
      appliedGround: "s7_2a",
    });
    expect(callsByid.get("d2")).toMatchObject({
      status: "accepted",
      appliedGround: "s7_2ba",
    });
    expect(callsByid.get("d3")).toMatchObject({
      status: "accepted",
      appliedGround: "s6a",
    });
  });

  it("uses the explicit ground argument over each row's suggestedGround when provided", async () => {
    // When the bulk caller passes an explicit ground, it overrides
    // any per-row suggestedGround. Same pre-fix behaviour for the
    // explicit-argument path; the change is only when the argument
    // is omitted.
    mockFindMany.mockResolvedValue([
      {
        id: "d1",
        documentId: docId,
        document: { batchId },
        appliedGround: null,
        suggestedGround: "s7(2)(a)",
      },
      {
        id: "d2",
        documentId: docId,
        document: { batchId },
        appliedGround: null,
        suggestedGround: "s6(a)",
      },
    ]);

    const result = await bulkAcceptDetections(["d1", "d2"], "s7(2)(c)(i)");

    expect(result.count).toBe(2);
    // Both rows get the normalised explicit ground (s7(2)(c)(i) →
    // s7_2ci), NOT their per-row suggestedGround.
    for (const [, data] of mockUpdate.mock.calls.map((c) => [c[0].where.id, c[0].data])) {
      expect((data as Record<string, unknown>).appliedGround).toBe("s7_2ci");
    }
  });

  it("preserves an existing appliedGround on rows that already have one set (no clobber)", async () => {
    // Edge case: a row that was previously accepted with a specific
    // ground (e.g. via single-accept), then re-included in a bulk
    // accept call without an explicit ground. The existing
    // appliedGround MUST survive — bulk-accept-without-argument
    // should never silently rewrite a per-row reviewer choice.
    mockFindMany.mockResolvedValue([
      {
        id: "d1",
        documentId: docId,
        document: { batchId },
        appliedGround: "s7_2a", // already set by a prior single-accept
        suggestedGround: "s6(a)",
      },
    ]);

    await bulkAcceptDetections(["d1"]);

    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({
      status: "accepted",
      appliedGround: "s7_2a", // preserved, NOT overwritten with s6_a
    });
  });

  it("leaves appliedGround unchanged when a row has neither appliedGround nor suggestedGround", async () => {
    // Manual detection edge case: someone bulk-accepts a row that
    // has no ground signal at all. Pre-fix: appliedGround stayed
    // null. Post-fix: same — we use `undefined` in the Prisma update
    // (which means "leave the field alone") rather than null
    // (which would explicitly clear).
    mockFindMany.mockResolvedValue([
      {
        id: "d1",
        documentId: docId,
        document: { batchId },
        appliedGround: null,
        suggestedGround: null,
      },
    ]);

    await bulkAcceptDetections(["d1"]);

    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({
      status: "accepted",
      // The per-row resolved ground is null → undefined in the update
      // → Prisma leaves appliedGround alone. We don't accidentally
      // clobber with null.
      appliedGround: undefined,
    });
  });

  it("wraps all per-row updates in a single $transaction for atomicity", async () => {
    // Concurrent bulk-accepts must not interleave — either every
    // row in this call commits with its resolved ground or none do.
    mockFindMany.mockResolvedValue([
      {
        id: "d1",
        documentId: docId,
        document: { batchId },
        appliedGround: null,
        suggestedGround: "s7(2)(a)",
      },
      {
        id: "d2",
        documentId: docId,
        document: { batchId },
        appliedGround: null,
        suggestedGround: "s6(a)",
      },
    ]);

    await bulkAcceptDetections(["d1", "d2"]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const txArg = mockTransaction.mock.calls[0][0];
    // The transaction received an array of pending update operations
    // (one per row). Asserting the array shape protects the atomicity
    // contract — if a refactor splits the loop back out of the
    // transaction, this fails.
    expect(Array.isArray(txArg)).toBe(true);
    expect((txArg as unknown[]).length).toBe(2);
  });

  it("returns count=0 with no updates when no detections matched the input ids", async () => {
    // Empty-array input is rejected by the zod schema upstream; the
    // authorised-set-empty case is the meaningful guard. If findMany
    // returns nothing (e.g. all ids referred to deleted detections),
    // bulkAcceptDetections short-circuits at count=0 before reaching
    // any update path.
    mockFindMany.mockResolvedValue([]);

    const result = await bulkAcceptDetections(["d-doesnt-exist"]);

    expect(result.count).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects bulks spanning multiple cases (auth-boundary preserved from pre-fix)", async () => {
    // The cross-case guard pre-dates this PR — the per-row refactor
    // must not weaken it. Two different batchIds in the result set
    // should still throw.
    mockFindMany.mockResolvedValue([
      {
        id: "d1",
        documentId: docId,
        document: { batchId: "case-A" },
        appliedGround: null,
        suggestedGround: "s7(2)(a)",
      },
      {
        id: "d2",
        documentId: docId,
        document: { batchId: "case-B" },
        appliedGround: null,
        suggestedGround: "s6(a)",
      },
    ]);

    await expect(bulkAcceptDetections(["d1", "d2"])).rejects.toThrow(
      /must belong to the same case/,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
