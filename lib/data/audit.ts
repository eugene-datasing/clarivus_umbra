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
 * Audit event types that are meaningful as notifications for other users.
 *
 * Excludes: individual detection accept/reject (too granular), bulk threshold
 * operations, settings/rule changes, and internal pipeline events. These
 * belong in the audit trail but aren't actionable notifications.
 */
const NOTIFICATION_EVENT_TYPES = [
  // Case lifecycle
  "case-created",
  "case_created",

  // Document uploads & processing complete
  "document-upload",
  "document-uploaded",
  "document_upload",
  "processing-complete",
  "processing-completed",
  "processing-error",

  // Review workflow transitions (actionable for the next person in the chain)
  "review-submitted",
  "senior-review-submitted",
  "senior-review",
  "senior-review-complete",
  "sign-off",
  "signed-off",
  "final-approval",
  "request-changes",

  // Export events
  "export-generated",
  "export-started",

  // Assignment
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
