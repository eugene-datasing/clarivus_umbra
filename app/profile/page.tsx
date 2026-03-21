import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDepartments } from "@/lib/data/departments";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  const sessionUser = await requireUser();

  const [dbUser, departments] = await Promise.all([
    prisma.user.findUnique({ where: { id: sessionUser.id } }),
    getDepartments(),
  ]);

  if (!dbUser) {
    return <div className="p-8 text-txt-secondary">User not found.</div>;
  }

  return (
    <ProfileClient
      user={{
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email || "",
        role: dbUser.role,
        departmentId: dbUser.departmentId,
      }}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
