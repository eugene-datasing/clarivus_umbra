import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";

export async function getAuditLog(caseId?: string) {
  const entries = await prisma.auditEntry.findMany({
    where: caseId ? { caseId } : undefined,
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
 * Compute a SHA-256 integrity hash for an audit entry.
 * The hash covers: previousHash | timestamp | userId | type | description | target | caseId
 */
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

export async function createAuditEntry(data: {
  userId?: string;
  userName: string;
  userRole: string;
  type: string;
  description: string;
  target: string;
  caseId?: string;
  detail?: string;
  previousValue?: string;
  newValue?: string;
}) {
  // Fetch the most recent audit entry to get its integrity hash
  const lastEntry = await prisma.auditEntry.findFirst({
    orderBy: { timestamp: "desc" },
    select: { integrityHash: true },
  });

  const previousHash = lastEntry?.integrityHash ?? null;
  const timestamp = new Date().toISOString();

  const integrityHash = computeIntegrityHash(
    previousHash,
    timestamp,
    data.userId,
    data.type,
    data.description,
    data.target,
    data.caseId,
  );

  return prisma.auditEntry.create({
    data: {
      timestamp: new Date(timestamp),
      userId: data.userId,
      userName: data.userName,
      userRole: data.userRole,
      type: data.type,
      description: data.description,
      target: data.target,
      caseId: data.caseId,
      detail: data.detail,
      previousValue: data.previousValue,
      newValue: data.newValue,
      integrityHash,
      previousHash,
    },
  });
}

/**
 * Verify the integrity of the audit hash chain.
 * Walks all entries in chronological order, recomputing each hash and
 * verifying it matches the stored value and that previousHash links are correct.
 */
export async function verifyAuditIntegrity(caseId?: string): Promise<{
  valid: boolean;
  totalEntries: number;
  brokenAt?: number; // Index of first broken link
}> {
  const entries = await prisma.auditEntry.findMany({
    where: caseId ? { caseId } : undefined,
    orderBy: { timestamp: "asc" },
  });

  if (entries.length === 0) {
    return { valid: true, totalEntries: 0 };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPreviousHash = i === 0 ? null : entries[i - 1].integrityHash;

    // Verify the previousHash link matches the prior entry's integrityHash
    if ((entry.previousHash ?? null) !== (expectedPreviousHash ?? null)) {
      return { valid: false, totalEntries: entries.length, brokenAt: i };
    }

    // Recompute the integrity hash and verify it matches the stored value
    const recomputedHash = computeIntegrityHash(
      entry.previousHash,
      entry.timestamp.toISOString(),
      entry.userId,
      entry.type,
      entry.description,
      entry.target,
      entry.caseId,
    );

    if (recomputedHash !== entry.integrityHash) {
      return { valid: false, totalEntries: entries.length, brokenAt: i };
    }
  }

  return { valid: true, totalEntries: entries.length };
}
