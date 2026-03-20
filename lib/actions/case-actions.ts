"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { getNextReference } from "@/lib/data/cases";
import { requireUser } from "@/lib/auth/session";
import { createCaseSchema } from "@/lib/validation/schemas";

export async function createCase(data: {
  requesterName: string;
  requesterType: string;
  dateReceived: string;
  deadline: string;
  priority: string;
  departments: string[];
  description: string;
}) {
  const validated = createCaseSchema.parse(data);
  const user = await requireUser();
  const reference = await getNextReference();

  const newCase = await prisma.case.create({
    data: {
      reference,
      requesterName: validated.requesterName,
      requesterType: validated.requesterType,
      dateReceived: new Date(validated.dateReceived),
      deadline: new Date(validated.deadline),
      priority: validated.priority,
      departments: validated.departments,
      description: validated.description,
      status: "draft",
    },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "admin",
    description: "Created LGOIMA request case",
    target: reference,
    caseId: newCase.id,
    detail: `Requester: ${data.requesterName}, Deadline: ${data.deadline}`,
  });

  return { id: newCase.id, reference };
}
