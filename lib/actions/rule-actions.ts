"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { requireUser } from "@/lib/auth/session";

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
  const user = await requireUser();
  const rule = await prisma.customRule.create({
    data: {
      name: data.name,
      type: data.type,
      status: data.status,
      matchMode: data.matchMode,
      keywords: data.keywords,
      scope: data.scope,
      priority: data.priority,
      suggestedGround: data.suggestedGround ?? null,
      description: data.description ?? "",
    },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "rule-created",
    description: `Created custom rule: "${data.name}"`,
    target: data.name,
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
  await prisma.customRule.update({
    where: { id: ruleId },
    data,
  });

  return { success: true };
}

export async function deleteRule(ruleId: string) {
  const user = await requireUser();
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
