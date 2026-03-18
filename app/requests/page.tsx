import { getCases } from "@/lib/data/cases";
import CasesListClient from "./cases-list-client";

export default async function RequestsPage() {
  const cases = await getCases();
  const totalCount = cases.length;
  const activeCount = cases.filter((r) => r.status !== "released" && r.status !== "draft").length;

  return (
    <CasesListClient
      cases={cases}
      totalCount={totalCount}
      activeCount={activeCount}
    />
  );
}
