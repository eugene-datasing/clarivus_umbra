import { getNextReference } from "@/lib/data/cases";
import NewRequestClient from "./new-request-client";

export default async function NewRequestPage() {
  const nextReference = await getNextReference();
  return <NewRequestClient nextReference={nextReference} />;
}
