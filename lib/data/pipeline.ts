/**
 * Data access layer for case review pipeline (milestones + assignments).
 */

import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Stage definitions
// ---------------------------------------------------------------------------

export const PIPELINE_STAGES = [
  { stage: "collection", label: "Document Collection", sortOrder: 1, accepts: "departments" as const, auto: false },
  { stage: "processing", label: "AI Processing", sortOrder: 2, accepts: "none" as const, auto: true },
  { stage: "initial-review", label: "Initial Review", sortOrder: 3, accepts: "users" as const, auto: false },
  { stage: "senior-review", label: "Senior Review", sortOrder: 4, accepts: "users" as const, auto: false },
  { stage: "final-approval", label: "Final Approval", sortOrder: 5, accepts: "users" as const, auto: false },
  { stage: "release", label: "Release", sortOrder: 6, accepts: "none" as const, auto: true },
] as const;

export type StageId = (typeof PIPELINE_STAGES)[number]["stage"];

// ---------------------------------------------------------------------------
// Working-day arithmetic (shared server/client)
// ---------------------------------------------------------------------------

export function subtractWorkingDays(from: Date, days: number): Date {
  const result = new Date(from);
  let subtracted = 0;
  while (subtracted < days) {
    result.setDate(result.getDate() - 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) subtracted++;
  }
  return result;
}

/**
 * Generate default milestone dates by working backwards from the deadline.
 */
export function generateDefaultMilestones(deadline: Date, priority: string) {
  // Compress for urgent cases
  const factor = priority === "urgent" ? 0.6 : priority === "extended" ? 1.5 : 1;

  return PIPELINE_STAGES.map((s) => {
    let daysBeforeDeadline: number;
    switch (s.stage) {
      case "collection":
        daysBeforeDeadline = Math.round(15 * factor);
        break;
      case "processing":
        daysBeforeDeadline = Math.round(14 * factor);
        break;
      case "initial-review":
        daysBeforeDeadline = Math.round(8 * factor);
        break;
      case "senior-review":
        daysBeforeDeadline = Math.round(4 * factor);
        break;
      case "final-approval":
        daysBeforeDeadline = Math.round(2 * factor);
        break;
      case "release":
        daysBeforeDeadline = 0;
        break;
    }
    return {
      stage: s.stage,
      label: s.label,
      sortOrder: s.sortOrder,
      targetDate: daysBeforeDeadline === 0 ? deadline : subtractWorkingDays(deadline, daysBeforeDeadline),
    };
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get users grouped by department for the palette.
 * Returns departments that have active users, with their users listed.
 */
export async function getUsersByDepartment(departmentNames: string[]) {
  const departments = await prisma.department.findMany({
    where: {
      isActive: true,
      name: { in: departmentNames },
    },
    orderBy: { sortOrder: "asc" },
    include: {
      users: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true, departmentId: true },
      },
    },
  });

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    users: d.users,
  }));
}

/**
 * Get users with privileged roles (senior-reviewer, final-approver, admin)
 * regardless of department.
 */
export async function getPrivilegedUsers() {
  return prisma.user.findMany({
    where: {
      role: { in: ["senior-reviewer", "final-approver", "admin"] },
    },
    select: {
      id: true,
      name: true,
      role: true,
      departmentId: true,
      department: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Get all other departments (not in the case) for the palette.
 */
export async function getOtherDepartments(excludeNames: string[]) {
  return prisma.department.findMany({
    where: {
      isActive: true,
      name: { notIn: excludeNames },
    },
    orderBy: { sortOrder: "asc" },
    include: {
      users: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true, departmentId: true },
      },
    },
  });
}

/**
 * Get the full pipeline for a case (milestones + assignments with user/dept info).
 */
export async function getCasePipeline(caseId: string) {
  const milestones = await prisma.caseMilestone.findMany({
    where: { caseId },
    orderBy: { sortOrder: "asc" },
    include: {
      assignments: {
        include: {
          user: { select: { id: true, name: true, role: true } },
          department: { select: { id: true, name: true } },
        },
      },
    },
  });

  return milestones.map((m) => ({
    id: m.id,
    stage: m.stage,
    label: m.label,
    targetDate: m.targetDate.toISOString(),
    completedAt: m.completedAt?.toISOString() ?? null,
    sortOrder: m.sortOrder,
    assignments: m.assignments.map((a) => ({
      id: a.id,
      type: a.type,
      role: a.role,
      userId: a.userId,
      userName: a.user?.name ?? null,
      userRole: a.user?.role ?? null,
      departmentId: a.departmentId,
      departmentName: a.department?.name ?? null,
    })),
  }));
}
