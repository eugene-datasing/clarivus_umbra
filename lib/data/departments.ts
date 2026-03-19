/**
 * Data access layer for departments.
 */

import { prisma } from "@/lib/db/prisma";

export async function getDepartments() {
  return prisma.department.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getAllDepartments() {
  return prisma.department.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { users: true } } },
  });
}

export async function getDepartmentById(id: string) {
  return prisma.department.findUnique({ where: { id } });
}

export async function getDepartmentNames(): Promise<string[]> {
  const depts = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true },
  });
  return depts.map((d) => d.name);
}
