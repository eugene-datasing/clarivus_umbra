import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/roles";
import { getRetentionConfig } from "@/lib/data/settings";
import { getBatchesInTrash } from "@/lib/data/batches";
import RetentionClient from "./retention-client";

export default async function RetentionPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) {
    redirect("/");
  }

  const [config, trashed, purgeLog] = await Promise.all([
    getRetentionConfig(),
    getBatchesInTrash(),
    prisma.purgeLog.findMany({
      orderBy: { archivedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <RetentionClient
      config={config}
      trashed={trashed}
      purgeLog={purgeLog.map((p) => ({
        id: p.id,
        batchRef: p.batchRef,
        archivePath: p.archivePath,
        totalEntries: p.totalEntries,
        chainValid: p.chainValid,
        archivedBy: p.archivedBy,
        archivedAt: p.archivedAt.toISOString(),
      }))}
    />
  );
}
