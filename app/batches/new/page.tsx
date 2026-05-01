import { getNextReference } from "@/lib/data/batches";
import NewBatchClient from "./new-batch-client";

export default async function NewBatchPage() {
  const nextReference = await getNextReference();
  return <NewBatchClient nextReference={nextReference} />;
}
