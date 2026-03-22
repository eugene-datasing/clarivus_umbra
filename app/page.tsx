import { redirect } from "next/navigation";
import { isActivated } from "@/lib/data/activation";
import { auth } from "@/lib/auth/auth-options";
import { getCases, getDashboardStats } from "@/lib/data/cases";
import { getRecentActivity } from "@/lib/data/audit";
import DashboardClient from "./dashboard-client";
import LandingPage from "./landing-page";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  // Check if user is authenticated
  const session = await auth();

  // Unauthenticated visitors see the landing page
  if (!session?.user) {
    return <LandingPage />;
  }

  // Authenticated users see the dashboard (with activation gate)
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
