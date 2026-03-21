import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getDocumentsForCase } from "@/lib/data/documents";
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
  const caseData = await getCase(id);

  if (!caseData) {
    notFound();
  }

  const documents = await getDocumentsForCase(id);

  return <CaseDetailClient caseData={caseData} documents={documents} />;
}
