/**
 * Read-only summary of the Phase 6 retention worker state.
 *
 * Used by the admin Settings → Backup tab and the Retention page
 * header to surface "is the worker doing anything" telemetry without
 * needing to introspect pg-boss directly.
 */

import { prisma } from "@/lib/db/prisma";

export interface RetentionStatus {
  lastArchivedAt: string | null;
  trashCount: number;
  archivedTotal: number;
}

export async function getRetentionStatus(): Promise<RetentionStatus> {
  const [latest, trashCount, archivedTotal] = await Promise.all([
    prisma.purgeLog.findFirst({
      orderBy: { archivedAt: "desc" },
      select: { archivedAt: true },
    }),
    prisma.batch.count({
      where: { deletedAt: { not: null }, purgedAt: null },
    }),
    prisma.purgeLog.count(),
  ]);

  return {
    lastArchivedAt: latest ? latest.archivedAt.toISOString() : null,
    trashCount,
    archivedTotal,
  };
}
