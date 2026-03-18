import { notFound } from "next/navigation";
import { getAuditLog } from "@/lib/data/audit";
import { getCase } from "@/lib/data/cases";
import AuditClient from "./audit-client";

export default async function AuditTrailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [caseData, auditEntries] = await Promise.all([
    getCase(id),
    getAuditLog(id),
  ]);

  if (!caseData) {
    notFound();
  }

  return (
    <AuditClient
      requestId={id}
      caseData={caseData}
      auditEntries={auditEntries}
    />
  );
}
