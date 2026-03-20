"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/authorize";
import { createRuleSchema, updateRuleSchema } from "@/lib/validation/schemas";

export async function createRule(data: {
  name: string;
  type: string;
  status: string;
  matchMode: string;
  keywords: string;
  scope: string;
  priority: string;
  suggestedGround?: string;
  description?: string;
}) {
  const validated = createRuleSchema.parse(data);
  const user = await requireUser();
  requireAdmin(user);
  const rule = await prisma.customRule.create({
    data: {
      name: validated.name,
      type: validated.type,
      status: validated.status,
      matchMode: validated.matchMode,
      keywords: validated.keywords,
      scope: validated.scope,
      priority: validated.priority,
      suggestedGround: validated.suggestedGround ?? null,
      description: validated.description ?? "",
    },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "rule-created",
    description: `Created custom rule: "${validated.name}"`,
    target: validated.name,
  });

  return { id: rule.id };
}

export async function updateRule(
  ruleId: string,
  data: {
    name?: string;
    type?: string;
    status?: string;
    matchMode?: string;
    keywords?: string;
    scope?: string;
    priority?: string;
    suggestedGround?: string | null;
    description?: string;
  },
) {
  const validated = updateRuleSchema.parse(data);
  const user = await requireUser();
  requireAdmin(user);
  await prisma.customRule.update({
    where: { id: ruleId },
    data: validated,
  });

  return { success: true };
}

export async function deleteRule(ruleId: string) {
  const user = await requireUser();
  requireAdmin(user);
  const rule = await prisma.customRule.findUnique({
    where: { id: ruleId },
    select: { name: true },
  });

  await prisma.customRule.delete({ where: { id: ruleId } });

  if (rule) {
    await createAuditEntry({
      userName: user.name,
      userRole: user.role,
      type: "rule-deleted",
      description: `Deleted custom rule: "${rule.name}"`,
      target: rule.name,
    });
  }

  return { success: true };
}

export async function toggleRuleStatus(ruleId: string) {
  const user = await requireUser();
  requireAdmin(user);
  const rule = await prisma.customRule.findUnique({
    where: { id: ruleId },
    select: { status: true, name: true },
  });
  if (!rule) throw new Error("Rule not found");

  const newStatus = rule.status === "Active" ? "Disabled" : "Active";
  await prisma.customRule.update({
    where: { id: ruleId },
    data: { status: newStatus },
  });

  return { success: true, newStatus };
}
