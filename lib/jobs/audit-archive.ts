/**
 * Audit-archive helpers for the Phase 6c retention worker.
 *
 * Produces four artefacts per purged batch under
 * `archives/{YYYY}/{batchId}/`:
 *
 *   audit.jsonl     — canonical JSON-Lines, one entry per line.
 *                     Field order matches the integrity-hash payload
 *                     so a downstream consumer can recompute hashes
 *                     byte-for-byte and verify the chain offline.
 *   audit.csv       — RFC-4180 CSV mirror (lossy, human-readable).
 *   integrity.json  — { batchId, totalEntries, chainValid, brokenAt?,
 *                       sha256OfJsonl, archivedAt }
 *   manifest.json   — { batchId, batchRef, batchName, createdAt,
 *                       deletedAt, purgedAt, documentCount,
 *                       detectionCount, archivePath }
 *
 *
 * TIMESTAMP GOTCHA — read carefully before changing anything in this
 * file.
 *
 * AuditEntry.timestamp is stored as `timestamp(3) without time zone`.
 * `createAuditEntry` writes `new Date(isoString)` where `isoString`
 * is the UTC ISO string at the moment of insertion. The hash
 * payload was computed against that ISO string. Postgres stores the
 * value WITHOUT timezone metadata, and the `pg` driver re-interprets
 * it on read in the server process's local timezone — producing a
 * different ISO string than the one that was hashed.
 *
 * `verifyAuditIntegrity` (lib/data/audit.ts) works around this with
 * raw SQL using `to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.
 * That format mirrors `Date.prototype.toISOString()` exactly:
 * 4-digit year, 2-digit month/day/hour/minute/second, 3-digit
 * milliseconds, literal `T` and `Z`. THIS module follows the same
 * pattern — see `loadCanonicalEntries` below — so the JSONL we emit
 * is byte-identical to the input that was hashed, and a roundtrip
 * verification passes. Don't switch to a Prisma findMany without
 * understanding the consequences.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getStorage } from "@/lib/storage";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "jobs/audit-archive" });

// ---------------------------------------------------------------------------
// Canonical row + serialisation
// ---------------------------------------------------------------------------

export interface CanonicalAuditRow {
  id: string;
  timestamp: string; // canonical ISO from to_char (matches the hashed value)
  userId: string | null;
  userName: string;
  userRole: string;
  type: string;
  description: string;
  target: string;
  batchId: string | null;
  detail: string | null;
  previousValue: string | null;
  newValue: string | null;
  integrityHash: string | null;
  previousHash: string | null;
}

/**
 * Read the audit chain for a batch in canonical form. Uses raw SQL
 * with `to_char` so timestamps round-trip identically to the value
 * that was hashed at insert time. See file header for the why.
 */
export async function loadCanonicalEntries(
  batchId: string,
): Promise<CanonicalAuditRow[]> {
  return prisma.$queryRaw<CanonicalAuditRow[]>`
    SELECT
      id,
      to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp",
      "userId",
      "userName",
      "userRole",
      type,
      description,
      target,
      "batchId",
      detail,
      "previousValue",
      "newValue",
      "integrityHash",
      "previousHash"
    FROM audit_entries
    WHERE "batchId" = ${batchId}
    ORDER BY timestamp ASC, id ASC
  `;
}

function computeIntegrityHash(
  previousHash: string | null,
  timestamp: string,
  userId: string | null,
  type: string,
  description: string,
  target: string,
  batchId: string | null,
): string {
  const payload = [
    previousHash ?? "",
    timestamp,
    userId ?? "",
    type,
    description,
    target,
    batchId ?? "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Walk the chain. Reports the first broken link (or unverified entry)
 * by index, or `chainValid: true` if every entry verifies. Entries
 * without an integrityHash (legacy seed data) are skipped — same
 * behaviour as `verifyAuditIntegrity` in lib/data/audit.ts.
 */
export function verifyAuditChainIntegrity(
  entries: CanonicalAuditRow[],
): { chainValid: boolean; brokenAt?: number } {
  if (entries.length === 0) return { chainValid: true };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.integrityHash) continue;

    if (i > 0 && entries[i - 1].integrityHash) {
      const expectedPreviousHash = entries[i - 1].integrityHash;
      if ((entry.previousHash ?? null) !== (expectedPreviousHash ?? null)) {
        return { chainValid: false, brokenAt: i };
      }
    }

    const recomputed = computeIntegrityHash(
      entry.previousHash,
      entry.timestamp,
      entry.userId,
      entry.type,
      entry.description,
      entry.target,
      entry.batchId,
    );
    if (recomputed !== entry.integrityHash) {
      return { chainValid: false, brokenAt: i };
    }
  }
  return { chainValid: true };
}

/**
 * Serialise the chain as JSON-Lines. Field order is fixed and matches
 * the hash payload's leading fields so downstream consumers can scan
 * the file linearly to verify. Each line ends in `\n`; the file ends
 * in `\n`.
 */
export function serialiseAuditChainToJsonl(
  entries: CanonicalAuditRow[],
): string {
  const lines = entries.map((e) =>
    JSON.stringify({
      id: e.id,
      timestamp: e.timestamp,
      userId: e.userId,
      type: e.type,
      description: e.description,
      target: e.target,
      batchId: e.batchId,
      detail: e.detail,
      userName: e.userName,
      userRole: e.userRole,
      previousValue: e.previousValue,
      newValue: e.newValue,
      integrityHash: e.integrityHash,
      previousHash: e.previousHash,
    }),
  );
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

/**
 * Deserialise a JSONL audit archive back to canonical rows. Used by
 * the cross-batch download endpoint when re-verifying chains at
 * download time. Throws on malformed input.
 */
export function deserialiseAuditJsonl(jsonl: string): CanonicalAuditRow[] {
  if (jsonl.length === 0) return [];
  const out: CanonicalAuditRow[] = [];
  const lines = jsonl.split("\n");
  for (const line of lines) {
    if (line.length === 0) continue;
    const obj = JSON.parse(line);
    out.push({
      id: obj.id,
      timestamp: obj.timestamp,
      userId: obj.userId ?? null,
      userName: obj.userName ?? "",
      userRole: obj.userRole ?? "",
      type: obj.type,
      description: obj.description,
      target: obj.target,
      batchId: obj.batchId ?? null,
      detail: obj.detail ?? null,
      previousValue: obj.previousValue ?? null,
      newValue: obj.newValue ?? null,
      integrityHash: obj.integrityHash ?? null,
      previousHash: obj.previousHash ?? null,
    });
  }
  return out;
}

function csvEscape(value: string | null): string {
  if (value === null || value === "") return "";
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function serialiseAuditChainToCsv(
  entries: CanonicalAuditRow[],
): string {
  const header = [
    "timestamp",
    "userName",
    "userRole",
    "type",
    "description",
    "target",
    "batchId",
    "detail",
    "integrityHash",
    "previousHash",
  ].join(",");
  const rows = entries.map((e) =>
    [
      e.timestamp,
      csvEscape(e.userName),
      csvEscape(e.userRole),
      csvEscape(e.type),
      csvEscape(e.description),
      csvEscape(e.target),
      csvEscape(e.batchId),
      csvEscape(e.detail),
      csvEscape(e.integrityHash),
      csvEscape(e.previousHash),
    ].join(","),
  );
  return [header, ...rows].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Archive entry point
// ---------------------------------------------------------------------------

export interface BatchMeta {
  id: string;
  reference: string;
  name: string;
  documentCount: number;
  detectionCount: number;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface ArchiveResult {
  archivePath: string; // archives/{YYYY}/{batchId}
  totalEntries: number;
  chainValid: boolean;
  brokenAt?: number;
  sha256OfJsonl: string;
}

/**
 * Build the audit archive for a soft-deleted batch and persist it to
 * blob storage. Performs a roundtrip verification (write JSONL → read
 * back → recompute SHA-256 → match integrity.json) before returning.
 *
 * Throws if the roundtrip fails. Callers (`runner.ts`) treat that as
 * a hard abort: the batch's `purgeStatus` stays `'purging'` so the
 * sweep won't re-claim it, and a human needs to investigate before
 * the cascade-delete proceeds.
 */
export async function archiveAuditChain(
  batchId: string,
  meta: BatchMeta,
  actor: string,
): Promise<ArchiveResult> {
  const storage = getStorage();
  const archivedAt = new Date();
  const year = archivedAt.getUTCFullYear();
  const archivePath = `archives/${year}/${batchId}`;

  log.info("[audit-archive] starting archive", { batchId, archivePath, actor });

  const entries = await loadCanonicalEntries(batchId);
  const jsonl = serialiseAuditChainToJsonl(entries);
  const csv = serialiseAuditChainToCsv(entries);
  const verdict = verifyAuditChainIntegrity(entries);

  const sha256OfJsonl = createHash("sha256")
    .update(jsonl, "utf8")
    .digest("hex");

  const integrity = {
    batchId,
    totalEntries: entries.length,
    chainValid: verdict.chainValid,
    ...(verdict.brokenAt !== undefined ? { brokenAt: verdict.brokenAt } : {}),
    sha256OfJsonl,
    archivedAt: archivedAt.toISOString(),
  };

  const manifest = {
    batchId: meta.id,
    batchRef: meta.reference,
    batchName: meta.name,
    createdAt: meta.createdAt.toISOString(),
    deletedAt: meta.deletedAt ? meta.deletedAt.toISOString() : null,
    purgedAt: archivedAt.toISOString(),
    documentCount: meta.documentCount,
    detectionCount: meta.detectionCount,
    archivePath,
    archivedBy: actor,
  };

  // Write all four artefacts.
  await storage.upload(
    `${archivePath}/audit.jsonl`,
    Buffer.from(jsonl, "utf8"),
    "application/x-ndjson",
  );
  await storage.upload(
    `${archivePath}/audit.csv`,
    Buffer.from(csv, "utf8"),
    "text/csv",
  );
  await storage.upload(
    `${archivePath}/integrity.json`,
    Buffer.from(JSON.stringify(integrity, null, 2), "utf8"),
    "application/json",
  );
  await storage.upload(
    `${archivePath}/manifest.json`,
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    "application/json",
  );

  // Roundtrip verification — read the JSONL back, recompute SHA-256
  // and the chain verdict. Mismatch is a hard abort: callers will
  // leave purgeStatus='purging' so the sweep doesn't re-claim, and
  // a human needs to investigate before any data is destroyed.
  const roundtrip = await storage.download(`${archivePath}/audit.jsonl`);
  const roundtripJsonl = roundtrip.toString("utf8");
  const roundtripSha = createHash("sha256")
    .update(roundtripJsonl, "utf8")
    .digest("hex");

  if (roundtripSha !== sha256OfJsonl) {
    throw new Error(
      `[audit-archive] roundtrip SHA-256 mismatch for batch ${batchId}: ` +
        `wrote ${sha256OfJsonl}, read back ${roundtripSha}`,
    );
  }

  const reparsed = deserialiseAuditJsonl(roundtripJsonl);
  const reparsedVerdict = verifyAuditChainIntegrity(reparsed);
  if (reparsedVerdict.chainValid !== verdict.chainValid) {
    throw new Error(
      `[audit-archive] roundtrip chain-verdict mismatch for batch ${batchId}: ` +
        `wrote chainValid=${verdict.chainValid}, read back chainValid=${reparsedVerdict.chainValid}`,
    );
  }

  log.info("[audit-archive] archive complete", {
    batchId,
    archivePath,
    totalEntries: entries.length,
    chainValid: verdict.chainValid,
  });

  return {
    archivePath,
    totalEntries: entries.length,
    chainValid: verdict.chainValid,
    ...(verdict.brokenAt !== undefined ? { brokenAt: verdict.brokenAt } : {}),
    sha256OfJsonl,
  };
}
