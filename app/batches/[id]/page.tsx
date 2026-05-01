import { notFound } from "next/navigation";
import { getBatch } from "@/lib/data/batches";
import { getDocumentsForCase } from "@/lib/data/documents";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import BatchDetailClient from "./batch-detail-client";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, id);
  const [batchData, documents] = await Promise.all([
    getBatch(id),
    getDocumentsForCase(id),
  ]);

  if (!batchData) {
    notFound();
  }

  return <BatchDetailClient batchData={batchData} documents={documents} />;
}
