import { redirect } from "next/navigation";
import { isActivated } from "@/lib/data/activation";
import { auth } from "@/lib/auth/auth-options";
import { getBatches, getDashboardStats } from "@/lib/data/batches";
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

  const [batches, dashboardStats, recentActivity] = await Promise.all([
    getBatches(),
    getDashboardStats(),
    getRecentActivity(10),
  ]);

  return (
    <DashboardClient
      batches={batches}
      dashboardStats={dashboardStats}
      recentActivity={recentActivity}
    />
  );
}
