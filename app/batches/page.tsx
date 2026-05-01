import { getBatches } from "@/lib/data/batches";
import BatchesListClient from "./batches-list-client";

export default async function BatchesPage() {
  const batches = await getBatches();
  const totalCount = batches.length;
  const activeCount = batches.filter((b) => b.status !== "exported" && b.status !== "draft").length;

  return (
    <BatchesListClient
      batches={batches}
      totalCount={totalCount}
      activeCount={activeCount}
    />
  );
}
