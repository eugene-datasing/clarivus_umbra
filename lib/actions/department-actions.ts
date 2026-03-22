"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/authorize";
import { createDepartmentSchema, updateDepartmentSchema } from "@/lib/validation/schemas";

function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

export async function createDepartment(data: {
  name: string;
  contactEmail?: string;
  headName?: string;
}) {
  const validated = createDepartmentSchema.parse(data);
  const user = await requireUser();
  await requireAdmin(user);

  try {
    const dept = await prisma.$transaction(async (tx) => {
      const maxSort = await tx.department.aggregate({ _max: { sortOrder: true } });
      const nextSort = (maxSort._max.sortOrder ?? 0) + 1;

      return tx.department.create({
        data: {
          name: validated.name,
          contactEmail: validated.contactEmail || null,
          headName: validated.headName || null,
          sortOrder: nextSort,
        },
      });
    });

    return { success: true, id: dept.id };
  } catch (err: unknown) {
    if (isPrismaUniqueConstraintError(err)) {
      return { success: false, error: "A department with this name already exists." };
    }
    throw err;
  }
}

export async function updateDepartment(
  id: string,
  data: { name?: string; contactEmail?: string; headName?: string; isActive?: boolean },
) {
  const validated = updateDepartmentSchema.parse(data);
  const user = await requireUser();
  await requireAdmin(user);

  try {
    await prisma.department.update({
      where: { id },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.contactEmail !== undefined && { contactEmail: validated.contactEmail || null }),
        ...(validated.headName !== undefined && { headName: validated.headName || null }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
      },
    });

    return { success: true };
  } catch (err: unknown) {
    if (isPrismaUniqueConstraintError(err)) {
      return { success: false, error: "A department with this name already exists." };
    }
    throw err;
  }
}

export async function deleteDepartment(id: string) {
  const user = await requireUser();
  await requireAdmin(user);

  // Move users in this department to no department
  await prisma.user.updateMany({
    where: { departmentId: id },
    data: { departmentId: null },
  });

  await prisma.department.delete({ where: { id } });

  return { success: true };
}

export async function reorderDepartments(orderedIds: string[]) {
  const user = await requireUser();
  await requireAdmin(user);

  for (let i = 0; i < orderedIds.length; i++) {
    await prisma.department.update({
      where: { id: orderedIds[i] },
      data: { sortOrder: i },
    });
  }

  return { success: true };
}

export async function seedDefaultDepartments() {
  const user = await requireUser();
  await requireAdmin(user);

  const defaults = [
    "Mayor and Councillors",
    "Chief Executive Office",
    "Corporate Services",
    "Infrastructure",
    "Community and Customer Services",
    "Planning and Regulatory",
    "Parks and Open Spaces",
    "Economic Development",
    "Communications",
    "Information Technology",
  ];

  const existing = await prisma.department.count();
  if (existing > 0) return { success: true, seeded: 0 };

  for (let i = 0; i < defaults.length; i++) {
    await prisma.department.create({
      data: {
        name: defaults[i],
        sortOrder: i,
      },
    });
  }

  return { success: true, seeded: defaults.length };
}
