import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth-options";
import { getRecentActivity } from "@/lib/data/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await getRecentActivity(5);
  return NextResponse.json(notifications);
}
