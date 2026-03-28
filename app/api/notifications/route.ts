import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth-options";
import { getNotifications } from "@/lib/data/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 401 });
  }

  const notifications = await getNotifications(userId, 8);
  return NextResponse.json(notifications);
}
