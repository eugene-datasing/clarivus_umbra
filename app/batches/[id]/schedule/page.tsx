import { notFound } from "next/navigation";
import { getBatch } from "@/lib/data/batches";
import { getWithholdingItems } from "@/lib/data/detections";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import ScheduleClient from "./schedule-client";

export default async function WithholdingSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, id);

  const [batchData, withholdingItems] = await Promise.all([
    getBatch(id),
    getWithholdingItems(id),
  ]);

  if (!batchData) {
    notFound();
  }

  return (
    <ScheduleClient
      requestId={id}
      batchData={batchData}
      withholdingItems={withholdingItems}
    />
  );
}
