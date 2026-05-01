import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getWithholdingItems } from "@/lib/data/detections";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import ScheduleClient from "./schedule-client";

export default async function WithholdingSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForCase(user, id);

  const [caseData, withholdingItems] = await Promise.all([
    getCase(id),
    getWithholdingItems(id),
  ]);

  if (!caseData) {
    notFound();
  }

  return (
    <ScheduleClient
      requestId={id}
      caseData={caseData}
      withholdingItems={withholdingItems}
    />
  );
}
