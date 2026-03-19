"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

export async function createDepartment(data: {
  name: string;
  contactEmail?: string;
  headName?: string;
}) {
  await requireUser();

  const maxSort = await prisma.department.aggregate({ _max: { sortOrder: true } });
  const nextSort = (maxSort._max.sortOrder ?? 0) + 1;

  const dept = await prisma.department.create({
    data: {
      name: data.name,
      contactEmail: data.contactEmail || null,
      headName: data.headName || null,
      sortOrder: nextSort,
    },
  });

  return { success: true, id: dept.id };
}

export async function updateDepartment(
  id: string,
  data: { name?: string; contactEmail?: string; headName?: string; isActive?: boolean },
) {
  await requireUser();

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
