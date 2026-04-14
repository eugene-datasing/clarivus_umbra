"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { getNextReference } from "@/lib/data/cases";
import { getLGOIMAConfig } from "@/lib/data/org-config";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import { createCaseSchema, extendDeadlineSchema } from "@/lib/validation/schemas";
import { addWorkingDays } from "@/lib/utils";
import { revalidatePath } from "next/cache";

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

export async function extendDeadline(data: {
  caseId: string;
  newDeadline: string;
  reason: string;
}) {
  const validated = extendDeadlineSchema.parse(data);
  const user = await requireUser();
  await authorizeForCase(user, validated.caseId);

  const existingCase = await prisma.case.findUniqueOrThrow({
    where: { id: validated.caseId },
    select: { id: true, reference: true, deadline: true, dateReceived: true },
  });

  const { extensionMaxDays } = await getLGOIMAConfig();
  const maxAllowed = addWorkingDays(existingCase.deadline, extensionMaxDays);
  const newDeadlineDate = new Date(validated.newDeadline);

  if (newDeadlineDate <= existingCase.deadline) {
    throw new Error("New deadline must be after the current deadline");
  }
  if (newDeadlineDate > maxAllowed) {
    throw new Error(
      `New deadline exceeds the maximum extension of ${extensionMaxDays} working days from the current deadline`,
    );
  }

  await prisma.case.update({
    where: { id: validated.caseId },
    data: { deadline: newDeadlineDate },
  });

  const oldDeadlineStr = existingCase.deadline.toISOString().split("T")[0];
  const newDeadlineStr = newDeadlineDate.toISOString().split("T")[0];

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "admin",
    description: "Extended case deadline",
    target: existingCase.reference,
    caseId: validated.caseId,
    previousValue: oldDeadlineStr,
    newValue: newDeadlineStr,
    detail: validated.reason,
  });

  revalidatePath(`/requests/${validated.caseId}`);
  return { success: true };
}
