import { getNextReference } from "@/lib/data/cases";
import { getDepartmentNames } from "@/lib/data/departments";
import { getLGOIMAConfig } from "@/lib/data/org-config";
import NewRequestClient from "./new-request-client";

export default async function NewRequestPage() {
  const [nextReference, departments, lgoimaConfig] = await Promise.all([
    getNextReference(),
    getDepartmentNames(),
    getLGOIMAConfig(),
  ]);
  return (
    <NewRequestClient
      nextReference={nextReference}
      departments={departments}
      defaultResponseDays={lgoimaConfig.defaultResponseDays}
    />
  );
}
