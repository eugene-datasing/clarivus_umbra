"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

interface UpdateProfileParams {
  departmentId: string | null;
}

export async function updateProfile(
  params: UpdateProfileParams,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    // Validate departmentId exists if provided
    if (params.departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: params.departmentId },
      });
      if (!dept) {
        return { success: false, error: "Department not found." };
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { departmentId: params.departmentId },
    });

    return { success: true };
  } catch {
    return { success: false, error: "Failed to update profile." };
  }
}
