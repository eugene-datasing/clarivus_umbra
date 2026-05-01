/**
 * Resource-level authorization helpers.
 *
 * All server actions call requireUser() for authentication, but that only
 * confirms *who* the caller is. These helpers confirm the caller is
 * *allowed* to access the specific batch / document / detection.
 *
 * Single-tenant simplification (Umbra v1): any authenticated user (admin
 * or reviewer) can access any non-soft-deleted batch. Admins can also
 * access soft-deleted batches (for Trash views). Per-batch reviewer
 * assignment is a v2 concern.
 */

import { prisma } from "@/lib/db/prisma";
import { isAdmin } from "@/lib/auth/roles";
import type { SessionUser } from "./session";

/**
 * Verify the user has access to a specific batch.
 *
 * Returns true if access is permitted, false otherwise. Returns false for
 * non-existent batches and for soft-deleted batches accessed by non-admins.
 */
export async function authorizeForBatch(
  user: SessionUser,
  batchId: string,
): Promise<boolean> {
  // Re-read role from DB rather than trusting the JWT claim, because the JWT
  // can be stale after role promotions (e.g. activation → admin).
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  const role = dbUser?.role ?? user.role;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { deletedAt: true },
  });

  if (!batch) return false;
  if (batch.deletedAt !== null && !isAdmin(role)) return false;

  return true;
}

/**
 * @deprecated Kept as an alias of `authorizeForBatch` to keep app/ callers
 * compiling until Phase 4b-ii migrates them. Lib/ has been migrated to
 * `authorizeForBatch`. Remove once app/ is fully on the canonical name.
 */
export const authorizeForCase = authorizeForBatch;

/**
 * Resolve a document to its parent batch, then authorize.
 * Returns the batchId on success, or null if access is denied.
 */
export async function authorizeForDocument(
  user: SessionUser,
  documentId: string,
): Promise<string | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { batchId: true },
  });
  if (!doc) return null;

  const ok = await authorizeForBatch(user, doc.batchId);
  return ok ? doc.batchId : null;
}

/**
 * Resolve a detection to its parent document/batch, then authorize.
 * Returns both IDs on success, or null if access is denied.
 */
export async function authorizeForDetection(
  user: SessionUser,
  detectionId: string,
): Promise<{ batchId: string; documentId: string } | null> {
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: {
      documentId: true,
      document: { select: { batchId: true } },
    },
  });
  if (!detection) return null;

  const ok = await authorizeForBatch(user, detection.document.batchId);
  if (!ok) return null;

  return {
    batchId: detection.document.batchId,
    documentId: detection.documentId,
  };
}

/**
 * Require admin-level role.
 *
 * Re-reads the role from the database rather than trusting the JWT claim,
 * because the JWT can be stale after role promotions (e.g. activation →
 * admin). This adds one lightweight SELECT but ensures authorisation is
 * always correct.
 */
export async function requireAdmin(user: SessionUser): Promise<void> {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  const role = dbUser?.role ?? user.role;
  if (!isAdmin(role)) {
    throw new Error("Access denied: admin role required");
  }
}
