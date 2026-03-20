"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import { generateDefaultMilestones, PIPELINE_STAGES } from "@/lib/data/pipeline";

interface MilestoneInput {
  stage: string;
  label: string;
  targetDate: string;
  sortOrder: number;
}

interface AssignmentInput {
  stage: string;
  type: "user" | "department";
  userId?: string;
  departmentId?: string;
  role?: string;
}

/**
 * Initialize default milestones for a case (called after case creation).
 * If milestones already exist, this is a no-op.
 */
export async function initializePipeline(caseId: string) {
  const user = await requireUser();
  await authorizeForCase(user, caseId);

  const existing = await prisma.caseMilestone.count({ where: { caseId } });
  if (existing > 0) return { created: false };

  const caseData = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { deadline: true, priority: true, reference: true, departments: true },
  });

  const milestones = generateDefaultMilestones(caseData.deadline, caseData.priority);

  for (const m of milestones) {
    await prisma.caseMilestone.create({
      data: {
        caseId,
        stage: m.stage,
        label: m.label,
        targetDate: m.targetDate,
        sortOrder: m.sortOrder,
      },
    });
  }

  return { created: true };
}

/**
 * Save the pipeline configuration (milestones + assignments).
 * Replaces all existing assignments for this case.
 */
export async function savePipeline(
  caseId: string,
  milestones: MilestoneInput[],
  assignments: AssignmentInput[],
) {
  const user = await requireUser();
  await authorizeForCase(user, caseId);

  const caseData = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { reference: true },
  });

  // Update milestone target dates
  for (const m of milestones) {
    await prisma.caseMilestone.update({
      where: { caseId_stage: { caseId, stage: m.stage } },
      data: { targetDate: new Date(m.targetDate) },
    });
  }

  // Clear existing assignments
  await prisma.caseAssignment.deleteMany({ where: { caseId } });

  // Create new assignments
  const milestoneMap = await prisma.caseMilestone.findMany({
    where: { caseId },
    select: { id: true, stage: true },
  });
  const stageToMilestoneId = new Map(milestoneMap.map((m) => [m.stage, m.id]));

  for (const a of assignments) {
    const milestoneId = stageToMilestoneId.get(a.stage);
    if (!milestoneId) continue;

    await prisma.caseAssignment.create({
      data: {
        caseId,
        milestoneId,
        type: a.type,
        userId: a.type === "user" ? a.userId : null,
        departmentId: a.type === "department" ? a.departmentId : null,
        role: a.role ?? null,
        assignedBy: user.name,
      },
    });
  }

  // Count assignments
  const userAssignments = assignments.filter((a) => a.type === "user").length;
  const deptAssignments = assignments.filter((a) => a.type === "department").length;

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "admin",
    description: `Configured review pipeline: ${userAssignments} reviewer(s), ${deptAssignments} department(s)`,
    target: caseData.reference,
    caseId,
  });

  return { success: true };
}
