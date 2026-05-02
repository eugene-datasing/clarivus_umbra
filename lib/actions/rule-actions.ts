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
  note?: string;
  description?: string;
}) {
  const validated = createRuleSchema.parse(data);
  const user = await requireUser();
  await requireAdmin(user);
  const rule = await prisma.customRule.create({
    data: {
      name: validated.name,
      type: validated.type,
      status: validated.status,
      matchMode: validated.matchMode,
      keywords: validated.keywords,
      scope: validated.scope,
      priority: validated.priority,
      note: validated.note ?? null,
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
    note?: string | null;
    description?: string;
  },
) {
  const validated = updateRuleSchema.parse(data);
  const user = await requireUser();
  await requireAdmin(user);
  await prisma.customRule.update({
    where: { id: ruleId },
    data: validated,
  });

  return { success: true };
}

export async function deleteRule(ruleId: string) {
  const user = await requireUser();
  await requireAdmin(user);
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
  await requireAdmin(user);
  const rule = await prisma.customRule.findUnique({
    where: { id: ruleId },
    select: { status: true, name: true },
  });
  if (!rule) throw new Error("Rule not found");

  // Active → Disabled; Draft or Disabled → Active
  const newStatus = rule.status === "Active" ? "Disabled" : "Active";
  await prisma.customRule.update({
    where: { id: ruleId },
    data: { status: newStatus },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "rule-toggled",
    description: `${rule.status} → ${newStatus}: "${rule.name}"`,
    target: rule.name,
  });

  return { success: true, newStatus };
}

export async function importRules(
  rulesData: Array<{
    name: string;
    type: string;
    status?: string;
    matchMode: string;
    keywords: string;
    scope?: string;
    priority?: string;
    note?: string;
    description?: string;
  }>,
): Promise<{ success: boolean; count?: number; error?: string }> {
  const user = await requireUser();
  await requireAdmin(user);

  if (!Array.isArray(rulesData) || rulesData.length === 0) {
    return { success: false, error: "No rules to import." };
  }

  let imported = 0;
  for (const rule of rulesData) {
    if (!rule.name || !rule.type || !rule.keywords) continue;
    const validated = createRuleSchema.parse({
      name: rule.name,
      type: rule.type,
      status: rule.status || "Draft",
      matchMode: rule.matchMode || "Exact",
      keywords: rule.keywords,
      scope: rule.scope || "All Documents",
      priority: rule.priority || "Medium",
      note: rule.note,
      description: rule.description || "",
    });
    await prisma.customRule.create({ data: validated });
    imported++;
  }

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "rules-imported",
    description: `Imported ${imported} custom rule(s) from JSON file`,
    target: `${imported} rules`,
  });

  return { success: true, count: imported };
}
