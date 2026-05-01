import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { stripPiiPatterns } from "./audit-sanitize";

export async function getAuditLog(batchId?: string) {
  const entries = await prisma.auditEntry.findMany({
    where: batchId ? { batchId } : undefined,
    orderBy: { timestamp: "desc" },
  });

  return entries.map((e) => ({
    id: e.id,
    timestamp: e.timestamp.toISOString(),
    userId: e.userId || "system",
    userName: e.userName,
    userRole: e.userRole,
    type: e.type,
    description: e.description,
    target: e.target,
    detail: e.detail ?? undefined,
    previousValue: e.previousValue ?? undefined,
    newValue: e.newValue ?? undefined,
    integrityHash: e.integrityHash ?? undefined,
    previousHash: e.previousHash ?? undefined,
  }));
}

/**
 * CHAIN SCOPE: Per-batch.
 * Each batch has its own independent hash chain. Entries without a batchId
 * are standalone (previousHash is null). This allows per-batch verification
 * and export without needing the full global audit history.
 */

/**
 * Compute a SHA-256 integrity hash for an audit entry.
 * The hash covers: previousHash | timestamp | userId | type | description | target | batchId
 */
function computeIntegrityHash(
  previousHash: string | null,
  timestamp: string,
  userId: string | null | undefined,
  type: string,
  description: string,
  target: string,
  batchId: string | null | undefined,
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

export async function createAuditEntry(data: {
  userId?: string;
  userName: string;
  userRole: string;
  type: string;
  description: string;
  target: string;
  batchId?: string;
  detail?: string;
  previousValue?: string;
  newValue?: string;
}) {
  // Sanitize free-text fields to strip PII patterns (emails, phones, IRD, NHI)
  // before storage and hash computation. This is the single enforcement point —
  // callers do not need to sanitize manually.
  const sanitized = {
    description: stripPiiPatterns(data.description),
    target: stripPiiPatterns(data.target),
    detail: data.detail ? stripPiiPatterns(data.detail) : undefined,
    previousValue: data.previousValue ? stripPiiPatterns(data.previousValue) : undefined,
    newValue: data.newValue ? stripPiiPatterns(data.newValue) : undefined,
  };

  const batchId = data.batchId;

  // Wrap read-previous + create in a serializable transaction to prevent
  // race conditions where two concurrent writes read the same previousHash.
  return prisma.$transaction(async (tx) => {
    // Chain within the batch scope. Entries without a batchId are standalone.
    const lastEntry = batchId
      ? await tx.auditEntry.findFirst({
          where: { batchId },
          orderBy: { timestamp: "desc" },
          select: { integrityHash: true },
        })
      : null;

    const previousHash = lastEntry?.integrityHash ?? null;
    const timestamp = new Date().toISOString();

    const integrityHash = computeIntegrityHash(
      previousHash,
      timestamp,
      data.userId,
      data.type,
      sanitized.description,
      sanitized.target,
      batchId,
    );

    return tx.auditEntry.create({
      data: {
        timestamp: new Date(timestamp),
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        type: data.type,
        description: sanitized.description,
        target: sanitized.target,
        batchId,
        detail: sanitized.detail,
        previousValue: sanitized.previousValue,
        newValue: sanitized.newValue,
        integrityHash,
        previousHash,
      },
    });
  }, { isolationLevel: "Serializable" });
}

/**
 * Get the most recent audit entries for the dashboard activity feed.
 */
export async function getRecentActivity(limit = 10) {
  const entries = await prisma.auditEntry.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return entries.map((e) => ({
    time: e.timestamp.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: false }),
    user: e.userName,
    action: e.description,
    type: mapAuditType(e.type),
  }));
}


/**
 * Audit event types meaningful as notifications for other users (Umbra v1).
 *
 * Excludes individual detection accept/reject (too granular), bulk threshold
 * operations, settings/rule changes, and internal pipeline events. Those
 * belong in the audit trail but aren't actionable notifications.
 */
const NOTIFICATION_EVENT_TYPES = [
  "batch-created",
  "document-uploaded",
  "processing-complete",
  "processing-error",
  "review-submitted",
  "signed-off",
  "export-generated",
  "document-assigned",
];

/**
 * Get notifications for the bell icon — meaningful events excluding the
 * current user's own actions.
 */
export async function getNotifications(currentUserId: string, limit = 8) {
  const entries = await prisma.auditEntry.findMany({
    where: {
      type: { in: NOTIFICATION_EVENT_TYPES },
      userId: { not: currentUserId },
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return entries.map((e) => ({
    time: e.timestamp.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit", hour12: false }),
    user: e.userName,
    action: e.description,
    type: mapAuditType(e.type),
  }));
}

function mapAuditType(type: string): "approval" | "review" | "detection" | "ingestion" | "system" {
  if (type.includes("approv") || type.includes("release")) return "approval";
  if (type.includes("review") || type.includes("reject") || type.includes("accept")) return "review";
  if (type.includes("detect") || type.includes("process")) return "detection";
  if (type.includes("upload") || type.includes("ingest") || type.includes("creat")) return "ingestion";
  return "system";
}

/**
 * Verify the integrity of the per-batch audit hash chain.
 * Walks all entries for the given batch in chronological order, recomputing
 * each hash and verifying it matches the stored value and that previousHash
 * links are correct.
 */
export async function verifyAuditIntegrity(batchId?: string): Promise<{
  valid: boolean;
  totalEntries: number;
  brokenAt?: number; // Index of first broken link
}> {
  // Use raw SQL to read timestamps as text in the exact format used during
  // hash computation. The column is `timestamp(3) without time zone` and
  // createAuditEntry writes `new Date(isoString)` — the stored value is the
  // UTC time WITHOUT timezone info. Prisma/pg would normally re-interpret
  // it in the server's local timezone, producing a different ISO string on
  // read. Using `to_char` bypasses that and returns the stored value back
  // in the original format.
  interface RawAuditRow {
    id: string;
    ts_iso: string;
    userId: string | null;
    type: string;
    description: string;
    target: string;
    batchId: string | null;
    integrityHash: string | null;
    previousHash: string | null;
  }

  const entries: RawAuditRow[] = batchId
    ? await prisma.$queryRaw`
        SELECT id,
               to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "ts_iso",
               "userId", type, description, target, "batchId",
               "integrityHash", "previousHash"
        FROM audit_entries
        WHERE "batchId" = ${batchId}
        ORDER BY timestamp ASC, id ASC`
    : await prisma.$queryRaw`
        SELECT id,
               to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "ts_iso",
               "userId", type, description, target, "batchId",
               "integrityHash", "previousHash"
        FROM audit_entries
        ORDER BY timestamp ASC, id ASC`;

  if (entries.length === 0) {
    return { valid: true, totalEntries: 0 };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Skip entries without an integrity hash (legacy seed data)
    if (!entry.integrityHash) continue;

    if (i > 0 && entries[i - 1].integrityHash) {
      const expectedPreviousHash = entries[i - 1].integrityHash;
      if ((entry.previousHash ?? null) !== (expectedPreviousHash ?? null)) {
        return { valid: false, totalEntries: entries.length, brokenAt: i };
      }
    }

    // Recompute the integrity hash and verify it matches the stored value
    const recomputedHash = computeIntegrityHash(
      entry.previousHash,
      entry.ts_iso,
      entry.userId,
      entry.type,
      entry.description,
      entry.target,
      entry.batchId,
    );

    if (recomputedHash !== entry.integrityHash) {
      return { valid: false, totalEntries: entries.length, brokenAt: i };
    }
  }

  return { valid: true, totalEntries: entries.length };
}
