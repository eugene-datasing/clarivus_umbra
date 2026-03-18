import { prisma } from "@/lib/db/prisma";

export async function getAuditLog(caseId?: string) {
  const entries = await prisma.auditEntry.findMany({
    where: caseId ? { caseId } : undefined,
    orderBy: { timestamp: "desc" },
  });

  return entries.map((e) => ({
    id: e.id,
    timestamp: e.timestamp.toISOString(),
    userId: e.userId || "system",
    userName: e.userName,
    userRole: e.userRole,
    type: e.type,
    description: e.description,
    target: e.target,
    detail: e.detail ?? undefined,
    previousValue: e.previousValue ?? undefined,
    newValue: e.newValue ?? undefined,
  }));
}

export async function createAuditEntry(data: {
  userId?: string;
  userName: string;
  userRole: string;
  type: string;
  description: string;
  target: string;
  caseId?: string;
  detail?: string;
  previousValue?: string;
  newValue?: string;
}) {
  return prisma.auditEntry.create({
    data: {
      userId: data.userId,
      userName: data.userName,
      userRole: data.userRole,
      type: data.type,
      description: data.description,
      target: data.target,
      caseId: data.caseId,
      detail: data.detail,
      previousValue: data.previousValue,
      newValue: data.newValue,
    },
  });
}
