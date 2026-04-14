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

// ---------------------------------------------------------------------------
// Per-case chain isolation tests
// ---------------------------------------------------------------------------

describe("per-case chain isolation", () => {
  function buildPerCaseChain(
    entries: Array<{
      timestamp: string;
      userId: string;
      type: string;
      description: string;
      target: string;
      caseId: string;
    }>,
  ) {
    // Groups entries by caseId and chains within each case independently
    const caseChains = new Map<string, Array<{
      previousHash: string | null;
      integrityHash: string;
      timestamp: string;
      userId: string;
      type: string;
      description: string;
      target: string;
      caseId: string;
    }>>();

    for (const entry of entries) {
      const chain = caseChains.get(entry.caseId) ?? [];
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
      caseChains.set(entry.caseId, chain);
    }

    return caseChains;
  }

  function verifyPerCaseChain(
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
    // Mirrors the updated verifyAuditIntegrity with legacy tolerance on index 0
    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];

      if (i > 0) {
        const expectedPreviousHash = chain[i - 1].integrityHash;
        if ((entry.previousHash ?? null) !== (expectedPreviousHash ?? null)) {
          return { valid: false, brokenAt: i };
        }
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

  it("two entries for the same case chain correctly", () => {
    const chains = buildPerCaseChain([
      { timestamp: "2025-01-01T00:00:00Z", userId: "u1", type: "upload", description: "Upload", target: "f.pdf", caseId: "case-A" },
      { timestamp: "2025-01-01T00:01:00Z", userId: "u1", type: "review", description: "Review", target: "f.pdf", caseId: "case-A" },
    ]);
    const caseA = chains.get("case-A")!;
    expect(caseA[1].previousHash).toBe(caseA[0].integrityHash);
    expect(verifyPerCaseChain(caseA)).toEqual({ valid: true });
  });

  it("entry for case A does not chain to entry for case B", () => {
    const chains = buildPerCaseChain([
      { timestamp: "2025-01-01T00:00:00Z", userId: "u1", type: "upload", description: "Upload A", target: "a.pdf", caseId: "case-A" },
      { timestamp: "2025-01-01T00:00:01Z", userId: "u1", type: "upload", description: "Upload B", target: "b.pdf", caseId: "case-B" },
      { timestamp: "2025-01-01T00:01:00Z", userId: "u1", type: "review", description: "Review A", target: "a.pdf", caseId: "case-A" },
    ]);

    const caseA = chains.get("case-A")!;
    const caseB = chains.get("case-B")!;

    // case-A entry 2 chains to case-A entry 1, not to case-B
    expect(caseA[1].previousHash).toBe(caseA[0].integrityHash);
    expect(caseA[1].previousHash).not.toBe(caseB[0].integrityHash);

    // Each case's chain validates independently
    expect(verifyPerCaseChain(caseA)).toEqual({ valid: true });
    expect(verifyPerCaseChain(caseB)).toEqual({ valid: true });
  });

  it("system entry (no caseId) has previousHash of null", () => {
    // Simulates a standalone system entry — no caseId, previousHash is null
    const integrityHash = computeIntegrityHash(
      null,
      "2025-01-01T00:00:00Z",
      "system",
      "settings-change",
      "Updated org name",
      "settings",
      undefined,
    );
    const systemEntry = {
      previousHash: null,
      integrityHash,
      timestamp: "2025-01-01T00:00:00Z",
      userId: "system",
      type: "settings-change",
      description: "Updated org name",
      target: "settings",
      caseId: "",
    };
    // Single standalone entry should verify
    expect(verifyPerCaseChain([systemEntry])).toEqual({ valid: true });
    expect(systemEntry.previousHash).toBeNull();
  });

  it("verifyPerCaseChain passes for a valid per-case chain", () => {
    const chains = buildPerCaseChain([
      { timestamp: "2025-01-01T00:00:00Z", userId: "u1", type: "upload", description: "Upload", target: "f.pdf", caseId: "case-X" },
      { timestamp: "2025-01-01T00:01:00Z", userId: "u2", type: "review", description: "Review", target: "f.pdf", caseId: "case-X" },
      { timestamp: "2025-01-01T00:02:00Z", userId: "u3", type: "approve", description: "Approve", target: "f.pdf", caseId: "case-X" },
    ]);
    expect(verifyPerCaseChain(chains.get("case-X")!)).toEqual({ valid: true });
  });

  it("verifyPerCaseChain fails when an entry hash is tampered with", () => {
    const chains = buildPerCaseChain([
      { timestamp: "2025-01-01T00:00:00Z", userId: "u1", type: "upload", description: "Upload", target: "f.pdf", caseId: "case-T" },
      { timestamp: "2025-01-01T00:01:00Z", userId: "u1", type: "review", description: "Review", target: "f.pdf", caseId: "case-T" },
    ]);
    const chain = chains.get("case-T")!;
    // Tamper with the second entry's description
    chain[1].description = "Tampered review";
    expect(verifyPerCaseChain(chain).valid).toBe(false);
    expect(verifyPerCaseChain(chain).brokenAt).toBe(1);
  });

  it("first entry with legacy non-null previousHash (from old global chain) is treated gracefully", () => {
    // Simulate a legacy entry whose previousHash points to an entry from another case
    const legacyPreviousHash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const firstEntryHash = computeIntegrityHash(
      legacyPreviousHash,
      "2025-01-01T00:00:00Z",
      "u1",
      "upload",
      "Upload",
      "f.pdf",
      "case-legacy",
    );
    const secondEntryHash = computeIntegrityHash(
      firstEntryHash,
      "2025-01-01T00:01:00Z",
      "u1",
      "review",
      "Review",
      "f.pdf",
      "case-legacy",
    );

    const chain = [
      {
        previousHash: legacyPreviousHash, // non-null legacy hash from old global chain
        integrityHash: firstEntryHash,
        timestamp: "2025-01-01T00:00:00Z",
        userId: "u1",
        type: "upload",
        description: "Upload",
        target: "f.pdf",
        caseId: "case-legacy",
      },
      {
        previousHash: firstEntryHash,
        integrityHash: secondEntryHash,
        timestamp: "2025-01-01T00:01:00Z",
        userId: "u1",
        type: "review",
        description: "Review",
        target: "f.pdf",
        caseId: "case-legacy",
      },
    ];

    // Should pass — the first entry's previousHash is legacy but the hash
    // recomputation is still correct given that previousHash value
    expect(verifyPerCaseChain(chain)).toEqual({ valid: true });
  });
});
