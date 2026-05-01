import { notFound } from "next/navigation";
import { getAuditLog } from "@/lib/data/audit";
import { getBatch } from "@/lib/data/batches";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import AuditClient from "./audit-client";

export default async function AuditTrailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, id);

  const [batchData, auditEntries] = await Promise.all([
    getBatch(id),
    getAuditLog(id),
  ]);

  if (!batchData) {
    notFound();
  }

  return (
    <AuditClient
      requestId={id}
      batchData={batchData}
      auditEntries={auditEntries}
    />
  );
}
