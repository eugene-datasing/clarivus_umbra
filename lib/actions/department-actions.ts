"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

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
  await requireUser();

  try {
    const dept = await prisma.$transaction(async (tx) => {
      const maxSort = await tx.department.aggregate({ _max: { sortOrder: true } });
      const nextSort = (maxSort._max.sortOrder ?? 0) + 1;

      return tx.department.create({
        data: {
          name: data.name,
          contactEmail: data.contactEmail || null,
          headName: data.headName || null,
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
  await requireUser();

  try {
    await prisma.department.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail || null }),
        ...(data.headName !== undefined && { headName: data.headName || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
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
  await requireUser();

  // Move users in this department to no department
  await prisma.user.updateMany({
    where: { departmentId: id },
    data: { departmentId: null },
  });

  await prisma.department.delete({ where: { id } });

  return { success: true };
}

export async function reorderDepartments(orderedIds: string[]) {
  await requireUser();

  for (let i = 0; i < orderedIds.length; i++) {
    await prisma.department.update({
      where: { id: orderedIds[i] },
      data: { sortOrder: i },
    });
  }

  return { success: true };
}

export async function seedDefaultDepartments() {
  await requireUser();

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
