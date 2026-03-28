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

/**
 * Recompute the case status based on the aggregate status of its documents.
 * Called after document status transitions to keep the case status in sync.
 *
 * Logic:
 *   - If any doc is processing/pending -> ingesting
 *   - If all non-excluded docs are ready or in-review -> in-review
 *   - If all non-excluded docs are reviewed (or better) -> senior-review
 *   - If all non-excluded docs are signed-off -> ready-export
 *   - released is only set manually (not computed here)
 */
export async function recomputeCaseStatus(caseId: string) {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    select: { status: true },
  });
  if (!caseRecord) return;

  // Don't touch draft or released cases
  if (caseRecord.status === "draft" || caseRecord.status === "released") return;

  const docs = await prisma.document.findMany({
    where: { caseId, status: { notIn: ["excluded"] } },
    select: { status: true },
  });

  // No documents -> stay as-is
  if (docs.length === 0) return;

  const statuses = docs.map((d) => d.status);

  const hasProcessingOrPending = statuses.some((s) => s === "processing" || s === "pending");
  const allReady = statuses.every((s) => ["ready", "in-review", "reviewed", "signed-off"].includes(s));
  const allReviewedOrBetter = statuses.every((s) => ["reviewed", "signed-off"].includes(s));
  const allSignedOff = statuses.every((s) => s === "signed-off");

  let newStatus: string;
  if (hasProcessingOrPending) {
    newStatus = "ingesting";
  } else if (allSignedOff) {
    newStatus = "ready-export";
  } else if (allReviewedOrBetter) {
    newStatus = "senior-review";
  } else if (allReady) {
    newStatus = "in-review";
  } else {
    // Mixed states (e.g. some error docs) -> stay as-is
    return;
  }

  if (newStatus !== caseRecord.status) {
    await prisma.case.update({
      where: { id: caseId },
      data: { status: newStatus },
    });
  }
}
