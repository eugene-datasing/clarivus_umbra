import { redirect } from "next/navigation";
import { isActivated } from "@/lib/data/activation";
import { getCases, getDashboardStats } from "@/lib/data/cases";
import { getRecentActivity } from "@/lib/data/audit";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Redundant activation gate — primary check is in root layout, but this
  // ensures the dashboard never renders on an unactivated instance even if
  // the layout check is bypassed (e.g. Next.js RSC caching edge case).
  const activated = await isActivated();
  if (!activated) {
    redirect("/activate");
  }

  const [cases, dashboardStats, recentActivity] = await Promise.all([
    getCases(),
    getDashboardStats(),
    getRecentActivity(10),
  ]);

  return <DashboardClient cases={cases} dashboardStats={dashboardStats} recentActivity={recentActivity} />;
}
