"use server";

import { prisma } from "@/lib/db/prisma";
import { createAuditEntry } from "@/lib/data/audit";
import { getNextReference } from "@/lib/data/batches";
import { requireUser } from "@/lib/auth/session";
import { createBatchSchema } from "@/lib/validation/schemas";

/**
 * Create a new batch. Per US-002, the user supplies a friendly `name`
 * (e.g. "May submission responses"); the system assigns a `reference`
 * (BATCH-YYYY-NNN) as the canonical identifier.
 */
export async function createBatch(data: { name: string }) {
  const validated = createBatchSchema.parse(data);
  const user = await requireUser();
  const reference = await getNextReference();

  const newBatch = await prisma.batch.create({
    data: {
      reference,
      name: validated.name,
      status: "draft",
    },
  });

  await createAuditEntry({
    userName: user.name,
    userRole: user.role,
    type: "batch-created",
    description: `Created batch "${validated.name}"`,
    target: reference,
    batchId: newBatch.id,
  });

  return { id: newBatch.id, reference };
}
