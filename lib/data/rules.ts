import { prisma } from "@/lib/db/prisma";

export async function getAllRules() {
  const rules = await prisma.customRule.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    matchMode: r.matchMode,
    keywords: r.keywords,
    scope: r.scope,
    priority: r.priority,
    suggestedGround: r.suggestedGround,
    description: r.description,
    matchCount: r.matchCount,
  }));
}

export async function getActiveRules() {
  const rules = await prisma.customRule.findMany({
    where: { status: "Active" },
    orderBy: { priority: "asc" },
  });
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    matchMode: r.matchMode,
    keywords: r.keywords,
    scope: r.scope,
    priority: r.priority,
    suggestedGround: r.suggestedGround,
  }));
}

export async function incrementMatchCount(ruleId: string, count: number) {
  await prisma.customRule.update({
    where: { id: ruleId },
    data: { matchCount: { increment: count } },
  });
}
