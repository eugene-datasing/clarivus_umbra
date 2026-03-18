import { notFound } from "next/navigation";
import { getCase } from "@/lib/data/cases";
import { getDocumentsForCase } from "@/lib/data/documents";
import CaseDetailClient from "./case-detail-client";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseData = await getCase(id);

  if (!caseData) {
    notFound();
  }

  const documents = await getDocumentsForCase(id);

  return <CaseDetailClient caseData={caseData} documents={documents} />;
}
