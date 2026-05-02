/**
 * Phase 6c audit-archive helpers — pure-function unit tests.
 *
 * Covers the JSONL serialiser, the chain-integrity verifier, and the
 * deserialise round trip. These are the pieces that gate the
 * cascade-delete decision in the retention worker, so the unit tests
 * here are the safety net for the entire archive pipeline.
 */
import { describe, it, expect } from "vitest";
import {
  serialiseAuditChainToJsonl,
  serialiseAuditChainToCsv,
  deserialiseAuditJsonl,
  verifyAuditChainIntegrity,
  type CanonicalAuditRow,
} from "../audit-archive";
import { createHash } from "crypto";

function hash(
  prev: string | null,
  ts: string,
  userId: string | null,
  type: string,
  desc: string,
  target: string,
  batchId: string | null,
): string {
  return createHash("sha256")
    .update(
      [
        prev ?? "",
        ts,
        userId ?? "",
        type,
        desc,
        target,
        batchId ?? "",
      ].join("|"),
    )
    .digest("hex");
}

function row(
  i: number,
  prev: string | null,
  batchId = "batch-1",
): CanonicalAuditRow {
  const ts = `2026-05-02T08:00:0${i}.000Z`;
  const integrity = hash(prev, ts, null, "smoke", `event ${i}`, "BATCH-001", batchId);
  return {
    id: `e${i}`,
    timestamp: ts,
    userId: null,
    userName: "Seed",
    userRole: "system",
    type: "smoke",
    description: `event ${i}`,
    target: "BATCH-001",
    batchId,
    detail: null,
    previousValue: null,
    newValue: null,
    integrityHash: integrity,
    previousHash: prev,
  };
}

describe("verifyAuditChainIntegrity", () => {
  it("reports valid for an empty chain", () => {
    expect(verifyAuditChainIntegrity([])).toEqual({ chainValid: true });
  });

  it("walks a valid chain", () => {
    const r1 = row(1, null);
    const r2 = row(2, r1.integrityHash);
    const r3 = row(3, r2.integrityHash);
    expect(verifyAuditChainIntegrity([r1, r2, r3])).toEqual({ chainValid: true });
  });

  it("flags a tampered hash with brokenAt", () => {
    const r1 = row(1, null);
    const r2 = row(2, r1.integrityHash);
    const r3 = row(3, r2.integrityHash);
    const bad = { ...r2, integrityHash: "deadbeef" };
    const verdict = verifyAuditChainIntegrity([r1, bad, r3]);
    expect(verdict.chainValid).toBe(false);
    expect(verdict.brokenAt).toBe(1);
  });

  it("flags a broken previousHash link", () => {
    const r1 = row(1, null);
    const r2 = row(2, "not-the-real-prev"); // previousHash mismatch
    const verdict = verifyAuditChainIntegrity([r1, r2]);
    expect(verdict.chainValid).toBe(false);
    expect(verdict.brokenAt).toBe(1);
  });

  it("skips legacy rows with null integrityHash", () => {
    const legacy: CanonicalAuditRow = {
      ...row(1, null),
      integrityHash: null,
    };
    expect(verifyAuditChainIntegrity([legacy])).toEqual({ chainValid: true });
  });
});

describe("serialiseAuditChainToJsonl + deserialiseAuditJsonl", () => {
  it("round-trips an empty chain", () => {
    expect(serialiseAuditChainToJsonl([])).toBe("");
    expect(deserialiseAuditJsonl("")).toEqual([]);
  });

  it("round-trips a 3-entry chain byte-for-byte verifying the chain", () => {
    const r1 = row(1, null);
    const r2 = row(2, r1.integrityHash);
    const r3 = row(3, r2.integrityHash);
    const jsonl = serialiseAuditChainToJsonl([r1, r2, r3]);

    // One line per entry, trailing newline.
    expect(jsonl.split("\n").filter(Boolean)).toHaveLength(3);
    expect(jsonl.endsWith("\n")).toBe(true);

    const parsed = deserialiseAuditJsonl(jsonl);
    expect(parsed).toHaveLength(3);
    expect(verifyAuditChainIntegrity(parsed)).toEqual({ chainValid: true });
  });

  it("preserves null fields exactly", () => {
    const r1 = row(1, null);
    const parsed = deserialiseAuditJsonl(serialiseAuditChainToJsonl([r1]));
    expect(parsed[0].userId).toBe(null);
    expect(parsed[0].previousHash).toBe(null);
    expect(parsed[0].detail).toBe(null);
  });
});

describe("serialiseAuditChainToCsv", () => {
  it("emits a header row + one row per entry, RFC-4180 quoted", () => {
    const r1 = row(1, null);
    const csv = serialiseAuditChainToCsv([r1]);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[0]).toMatch(/^timestamp,userName,userRole,type,/);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes commas and double-quotes inside values", () => {
    const r: CanonicalAuditRow = {
      ...row(1, null),
      description: 'has, "quotes" and a comma',
    };
    const csv = serialiseAuditChainToCsv([r]);
    expect(csv).toContain('"has, ""quotes"" and a comma"');
  });
});
