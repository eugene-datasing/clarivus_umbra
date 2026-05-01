import { getCases } from "@/lib/data/cases";
import { getLGOIMAConfig } from "@/lib/data/org-config";
import CasesListClient from "./cases-list-client";

export default async function RequestsPage() {
  const [cases, lgoimaConfig] = await Promise.all([
    getCases(),
    getLGOIMAConfig(),
  ]);
  const totalCount = cases.length;
  const activeCount = cases.filter((r) => r.status !== "released" && r.status !== "draft").length;

  return (
    <CasesListClient
      cases={cases}
      totalCount={totalCount}
      activeCount={activeCount}
      amberWarningDays={lgoimaConfig.amberWarningDays}
      redWarningDays={lgoimaConfig.redWarningDays}
    />
  );
}
