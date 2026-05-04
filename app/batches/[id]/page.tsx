import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getBatch } from "@/lib/data/batches";
import { getDocumentsForCase } from "@/lib/data/documents";
import {
  getAutoRedactConfig,
  resolveRequireExportConfirmation,
} from "@/lib/data/settings";
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
  const [batchData, documents, autoRedactConfig, override] = await Promise.all([
    getBatch(id),
    getDocumentsForCase(id),
    getAutoRedactConfig(),
    prisma.batch.findUnique({
      where: { id },
      select: { requireExportConfirmation: true },
    }),
  ]);

  if (!batchData) {
    notFound();
  }

  const requireExportConfirmation = resolveRequireExportConfirmation(
    autoRedactConfig,
    override?.requireExportConfirmation ?? null,
  );

  return (
    <BatchDetailClient
      batchData={batchData}
      documents={documents}
      requireExportConfirmation={requireExportConfirmation}
    />
  );
}
