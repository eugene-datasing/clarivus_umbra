/**
 * Resource-level authorization helpers.
 *
 * All server actions call requireUser() for authentication, but that only
 * confirms *who* the caller is.  These helpers confirm the caller is
 * *allowed* to access the specific case / document / detection.
 */

import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "./session";

/** Roles that bypass department-level checks. */
const PRIVILEGED_ROLES = new Set([
  "admin",
  "request-manager",
  "senior-reviewer",
  "final-approver",
]);

/**
 * Verify the user has access to a specific case.
 *
 * Privileged roles bypass the check.  For all other roles the user's
 * department must appear in the case's departments list.
 */
export async function authorizeForCase(
  user: SessionUser,
  caseId: string,
): Promise<void> {
  // Re-read role from DB rather than trusting the JWT claim, because the JWT
  // can be stale after role promotions (e.g. activation → admin).
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, departmentId: true },
  });

  const role = dbUser?.role ?? user.role;
  if (PRIVILEGED_ROLES.has(role)) return;

  if (!dbUser?.departmentId) {
    throw new Error("Access denied: user has no department assignment");
  }

  const [caseRecord, dept] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: { departments: true },
    }),
    prisma.department.findUnique({
      where: { id: dbUser.departmentId },
      select: { name: true },
    }),
  ]);

  if (!caseRecord) throw new Error("Case not found");
  if (!dept) throw new Error("Access denied: user department not found");

  if (!caseRecord.departments.includes(dept.name)) {
    throw new Error("Access denied: user department not assigned to this case");
  }
}

/**
 * Resolve a document to its parent case, then authorize.
 * Returns the caseId for convenience.
 */
export async function authorizeForDocument(
  user: SessionUser,
  documentId: string,
): Promise<string> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { caseId: true },
  });
  if (!doc) throw new Error("Document not found");

  // Re-read role from DB (JWT may be stale after role promotion)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  const role = dbUser?.role ?? user.role;
  if (PRIVILEGED_ROLES.has(role)) return doc.caseId;

  await authorizeForCase(user, doc.caseId);
  return doc.caseId;
}

/**
 * Resolve a detection to its parent document/case, then authorize.
 * Returns both IDs for convenience.
 */
export async function authorizeForDetection(
  user: SessionUser,
  detectionId: string,
): Promise<{ caseId: string; documentId: string }> {
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: {
      documentId: true,
      document: { select: { caseId: true } },
    },
  });
  if (!detection) throw new Error("Detection not found");

  // Re-read role from DB (JWT may be stale after role promotion)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  const role = dbUser?.role ?? user.role;
  if (!PRIVILEGED_ROLES.has(role)) {
    await authorizeForCase(user, detection.document.caseId);
  }

  return {
    caseId: detection.document.caseId,
    documentId: detection.documentId,
  };
}

/**
 * Require admin-level role.
 *
 * Re-reads the role from the database rather than trusting the JWT claim,
 * because the JWT can be stale after role promotions (e.g. activation →
 * admin).  This adds one lightweight SELECT but ensures authorisation is
 * always correct.
 */
export async function requireAdmin(user: SessionUser): Promise<void> {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  const role = dbUser?.role ?? user.role;
  if (role !== "admin" && role !== "request-manager") {
    throw new Error("Access denied: admin role required");
  }
}
