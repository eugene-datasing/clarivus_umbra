"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { getNextReference } from "@/lib/data/cases";

export async function createCase(data: {
  requesterName: string;
  requesterType: string;
  dateReceived: string;
  deadline: string;
  priority: string;
  departments: string[];
  description: string;
}) {
  const reference = await getNextReference();

  const newCase = await prisma.case.create({
    data: {
      reference,
      requesterName: data.requesterName,
      requesterType: data.requesterType,
      dateReceived: new Date(data.dateReceived),
      deadline: new Date(data.deadline),
      priority: data.priority,
      departments: data.departments,
      description: data.description,
      status: "draft",
    },
  });

  await createAuditEntry({
    userName: "A. Richardson",
    userRole: "Request Manager",
    type: "admin",
    description: "Created LGOIMA request case",
    target: reference,
    caseId: newCase.id,
    detail: `Requester: ${data.requesterName}, Deadline: ${data.deadline}`,
  });

  return { id: newCase.id, reference };
}
