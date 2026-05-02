import { getBatches } from "@/lib/data/batches";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import BatchesListClient from "./batches-list-client";

export default async function BatchesPage() {
  const user = await requireUser();
  const batches = await getBatches();
  const totalCount = batches.length;
  const activeCount = batches.filter(
    (b) => b.status !== "exported" && b.status !== "draft",
  ).length;

  return (
    <BatchesListClient
      batches={batches}
      totalCount={totalCount}
      activeCount={activeCount}
      canDelete={isAdmin(user.role)}
    />
  );
}
