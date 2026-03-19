import { getNextReference } from "@/lib/data/cases";
import { getDepartmentNames } from "@/lib/data/departments";
import NewRequestClient from "./new-request-client";

export default async function NewRequestPage() {
  const [nextReference, departments] = await Promise.all([
    getNextReference(),
    getDepartmentNames(),
  ]);
  return <NewRequestClient nextReference={nextReference} departments={departments} />;
}
