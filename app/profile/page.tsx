import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  const sessionUser = await requireUser();

  const dbUser = await prisma.user.findUnique({ where: { id: sessionUser.id } });

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
      }}
    />
  );
}
