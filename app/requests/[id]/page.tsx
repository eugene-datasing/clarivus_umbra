import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getDocumentsForCase } from "@/lib/data/documents";
import { getLGOIMAConfig } from "@/lib/data/org-config";
import { requireUser } from "@/lib/auth/session";
import { authorizeForCase } from "@/lib/auth/authorize";
import CaseDetailClient from "./case-detail-client";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForCase(user, id);
  const [caseData, documents, lgoimaConfig] = await Promise.all([
    getCase(id),
    getDocumentsForCase(id),
    getLGOIMAConfig(),
  ]);

  if (!caseData) {
    notFound();
  }

  return (
    <CaseDetailClient
      caseData={caseData}
      documents={documents}
      amberWarningDays={lgoimaConfig.amberWarningDays}
      redWarningDays={lgoimaConfig.redWarningDays}
      extensionMaxDays={lgoimaConfig.extensionMaxDays}
    />
  );
}
