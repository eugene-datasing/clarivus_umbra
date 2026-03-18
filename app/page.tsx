import { getCases, getDashboardStats } from "@/lib/data/cases";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const [cases, dashboardStats] = await Promise.all([
    getCases(),
    getDashboardStats(),
  ]);

  return <DashboardClient cases={cases} dashboardStats={dashboardStats} />;
}
