import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Re-implement computeIntegrityHash to test determinism / tamper detection.
// This mirrors the private function in audit.ts.
// ---------------------------------------------------------------------------

function computeIntegrityHash(
  previousHash: string | null,
  timestamp: string,
  userId: string | null | undefined,
  type: string,
  description: string,
  target: string,
  caseId: string | null | undefined,
): string {
  const payload = [
    previousHash ?? "",
    timestamp,
    userId ?? "",
    type,
    description,
    target,
    caseId ?? "",
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

describe("computeIntegrityHash", () => {
  const baseArgs = {
    previousHash: null as string | null,
    timestamp: "2025-01-15T10:00:00.000Z",
    userId: "user-1",
    type: "document_uploaded",
    description: "Uploaded Report.pdf",
    target: "Report.pdf",
    caseId: "case-1",
  };

  it("produces a 64-character hex string", () => {
    const hash = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent results for the same inputs", () => {
    const h1 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    const h2 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    expect(h1).toBe(h2);
  });

  it("changes when timestamp is modified", () => {
    const h1 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    const h2 = computeIntegrityHash(
      baseArgs.previousHash,
      "2025-01-15T10:00:01.000Z",
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    expect(h1).not.toBe(h2);
  });

  it("changes when userId is modified", () => {
    const h1 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      "user-1",
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    const h2 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      "user-2",
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    expect(h1).not.toBe(h2);
  });

  it("changes when type is modified", () => {
    const h1 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      "document_uploaded",
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    const h2 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      "document_deleted",
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    expect(h1).not.toBe(h2);
  });

  it("changes when description is modified", () => {
    const h1 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      "Uploaded Report.pdf",
      baseArgs.target,
      baseArgs.caseId,
    );
    const h2 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      "Uploaded Invoice.pdf",
      baseArgs.target,
      baseArgs.caseId,
    );
    expect(h1).not.toBe(h2);
  });

  it("changes when target is modified", () => {
    const h1 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      "Report.pdf",
      baseArgs.caseId,
    );
    const h2 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      "Invoice.pdf",
      baseArgs.caseId,
    );
    expect(h1).not.toBe(h2);
  });

  it("changes when caseId is modified", () => {
    const h1 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      "case-1",
    );
    const h2 = computeIntegrityHash(
      baseArgs.previousHash,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      "case-2",
    );
    expect(h1).not.toBe(h2);
  });

  it("changes when previousHash is modified", () => {
    const h1 = computeIntegrityHash(
      null,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    const h2 = computeIntegrityHash(
      "abc123def456",
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    expect(h1).not.toBe(h2);
  });

  it("handles null userId gracefully", () => {
    const h1 = computeIntegrityHash(
      null,
      baseArgs.timestamp,
      null,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      baseArgs.caseId,
    );
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles undefined caseId gracefully", () => {
    const h1 = computeIntegrityHash(
      null,
      baseArgs.timestamp,
      baseArgs.userId,
      baseArgs.type,
      baseArgs.description,
      baseArgs.target,
      undefined,
    );
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Verify chain integrity logic (mirrors verifyAuditIntegrity)
// ---------------------------------------------------------------------------

describe("audit chain integrity verification", () => {
  function buildChain(
    entries: Array<{
      timestamp: string;
      userId: string;
      type: string;
      description: string;
      target: string;
      caseId: string;
    }>,
  ) {
    const chain: Array<{
      previousHash: string | null;
      integrityHash: string;
      timestamp: string;
      userId: string;
      type: string;
      description: string;
      target: string;
      caseId: string;
    }> = [];

    for (const entry of entries) {
      const previousHash = chain.length > 0 ? chain[chain.length - 1].integrityHash : null;
      const integrityHash = computeIntegrityHash(
        previousHash,
        entry.timestamp,
        entry.userId,
        entry.type,
        entry.description,
        entry.target,
        entry.caseId,
      );
      chain.push({ ...entry, previousHash, integrityHash });
    }
    return chain;
  }

  function verifyChain(
    chain: Array<{
      previousHash: string | null;
      integrityHash: string;
      timestamp: string;
      userId: string;
      type: string;
      description: string;
      target: string;
      caseId: string;
    }>,
  ): { valid: boolean; brokenAt?: number } {
    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];
      const expectedPreviousHash = i === 0 ? null : chain[i - 1].integrityHash;

      if ((entry.previousHash ?? null) !== (expectedPreviousHash ?? null)) {
        return { valid: false, brokenAt: i };
      }

      const recomputed = computeIntegrityHash(
        entry.previousHash,
        entry.timestamp,
        entry.userId,
        entry.type,
        entry.description,
        entry.target,
        entry.caseId,
      );

      if (recomputed !== entry.integrityHash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true };
  }

  it("validates a correct chain", () => {
    const chain = buildChain([
      { timestamp: "2025-01-01T00:00:00Z", userId: "u1", type: "upload", description: "Upload", target: "f.pdf", caseId: "c1" },
      { timestamp: "2025-01-01T00:01:00Z", userId: "u1", type: "review", description: "Review", target: "f.pdf", caseId: "c1" },
      { timestamp: "2025-01-01T00:02:00Z", userId: "u2", type: "approve", description: "Approve", target: "f.pdf", caseId: "c1" },
    ]);
    expect(verifyChain(chain)).toEqual({ valid: true });
  });

  it("detects a tampered description", () => {
    const chain = buildChain([
      { timestamp: "2025-01-01T00:00:00Z", userId: "u1", type: "upload", description: "Upload", target: "f.pdf", caseId: "c1" },
      { timestamp: "2025-01-01T00:01:00Z", userId: "u1", type: "review", description: "Review", target: "f.pdf", caseId: "c1" },
    ]);

    // Tamper with the first entry's description
    chain[0].description = "Tampered";

    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it("detects a broken previousHash link", () => {
    const chain = buildChain([
      { timestamp: "2025-01-01T00:00:00Z", userId: "u1", type: "upload", description: "Upload", target: "f.pdf", caseId: "c1" },
      { timestamp: "2025-01-01T00:01:00Z", userId: "u1", type: "review", description: "Review", target: "f.pdf", caseId: "c1" },
    ]);

    // Break the chain link
    chain[1].previousHash = "tampered-hash";

    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("validates an empty chain", () => {
    expect(verifyChain([])).toEqual({ valid: true });
  });

  it("validates a single-entry chain", () => {
    const chain = buildChain([
      { timestamp: "2025-01-01T00:00:00Z", userId: "u1", type: "upload", description: "Upload", target: "f.pdf", caseId: "c1" },
    ]);
    expect(verifyChain(chain)).toEqual({ valid: true });
  });
});
