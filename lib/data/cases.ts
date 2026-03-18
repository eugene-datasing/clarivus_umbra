import { prisma } from "@/lib/db/prisma";

export async function getCases() {
  const cases = await prisma.case.findMany({
    orderBy: { dateReceived: "desc" },
  });

  return cases.map((c) => ({
    id: c.id,
    reference: c.reference,
    requesterName: c.requesterName,
    requesterType: c.requesterType,
    dateReceived: c.dateReceived.toISOString().split("T")[0],
    deadline: c.deadline.toISOString().split("T")[0],
    priority: c.priority as "standard" | "urgent" | "extended",
    department: c.departments,
    description: c.description,
    status: c.status,
    documentCount: c.documentCount,
    reviewedCount: c.reviewedCount,
    redactionCount: c.redactionCount,
  }));
}

export async function getCase(id: string) {
  const c = await prisma.case.findUnique({ where: { id } });
  if (!c) return null;

  return {
    id: c.id,
    reference: c.reference,
    requesterName: c.requesterName,
    requesterType: c.requesterType,
    dateReceived: c.dateReceived.toISOString().split("T")[0],
    deadline: c.deadline.toISOString().split("T")[0],
    priority: c.priority as "standard" | "urgent" | "extended",
    department: c.departments,
    description: c.description,
    status: c.status,
    documentCount: c.documentCount,
    reviewedCount: c.reviewedCount,
    redactionCount: c.redactionCount,
  };
}

export async function getNextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const latestCase = await prisma.case.findFirst({
    where: { reference: { startsWith: `LGOIMA-${year}` } },
    orderBy: { reference: "desc" },
  });

  if (!latestCase) return `LGOIMA-${year}-001`;

  const lastNum = parseInt(latestCase.reference.split("-").pop() || "0", 10);
  return `LGOIMA-${year}-${String(lastNum + 1).padStart(3, "0")}`;
}

export async function getDashboardStats() {
  const [totalCases, activeCases, totalDocuments, totalDetections] = await Promise.all([
    prisma.case.count(),
    prisma.case.count({ where: { status: { notIn: ["released", "draft"] } } }),
    prisma.case.aggregate({ _sum: { documentCount: true } }),
    prisma.case.aggregate({ _sum: { redactionCount: true } }),
  ]);

  const casesByStatus = await prisma.case.groupBy({
    by: ["status"],
    _count: true,
  });

  return {
    totalCases,
    activeCases,
    totalDocuments: totalDocuments._sum.documentCount || 0,
    totalDetections: totalDetections._sum.redactionCount || 0,
    casesByStatus: Object.fromEntries(casesByStatus.map((s) => [s.status, s._count])),
  };
}
