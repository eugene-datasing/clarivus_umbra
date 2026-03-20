import { prisma } from "@/lib/db/prisma";

const priorityWeight: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

function sortByPriority<T extends { priority: string }>(rules: T[]): T[] {
  return rules.sort(
    (a, b) => (priorityWeight[a.priority] ?? 99) - (priorityWeight[b.priority] ?? 99),
  );
}

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
  });
  const mapped = rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    matchMode: r.matchMode,
    keywords: r.keywords,
    scope: r.scope,
    priority: r.priority,
    suggestedGround: r.suggestedGround,
  }));
  return sortByPriority(mapped);
}

export async function incrementMatchCount(ruleId: string, count: number) {
  await prisma.customRule.update({
    where: { id: ruleId },
    data: { matchCount: { increment: count } },
  });
}
