import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getBatch } from "@/lib/data/batches";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import { DEFAULT_GROUND_FOR_TYPE } from "@/lib/detection-type-grounds";
import StatsClient, {
  type StatsClientProps,
  type DocStats,
} from "./stats-client";

export default async function BatchStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, id);

  const batchData = await getBatch(id);
  if (!batchData) notFound();

  // Pull every active document for this batch + the per-(doc,type,status)
  // detection counts in two groupBys. Excludes "excluded" docs from the
  // surface but still counts their detections if any survived (defensive
  // — excluded docs typically have detections deleted with them).
  const documents = await prisma.document.findMany({
    where: { batchId: id, status: { notIn: ["excluded"] } },
    select: {
      id: true,
      name: true,
      status: true,
      pageCount: true,
      detectionCount: true,
    },
    orderBy: { name: "asc" },
  });

  const docIds = documents.map((d) => d.id);

  const [byTypeStatus, byStatus, byType] = await Promise.all([
    docIds.length > 0
      ? prisma.detection.groupBy({
          by: ["documentId", "type", "status"],
          where: { documentId: { in: docIds } },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as Array<{
            documentId: string;
            type: string;
            status: string;
            _count: { _all: number };
          }>,
        ),
    docIds.length > 0
      ? prisma.detection.groupBy({
          by: ["status"],
          where: { documentId: { in: docIds } },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
    docIds.length > 0
      ? prisma.detection.groupBy({
          by: ["type"],
          where: { documentId: { in: docIds } },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ type: string; _count: { _all: number } }>),
  ]);

  // Roll byTypeStatus into per-doc maps for the collapsible rows.
  const docStats: DocStats[] = documents.map((doc) => {
    const rows = byTypeStatus.filter((r) => r.documentId === doc.id);
    const typeCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {
      accepted: 0,
      pending: 0,
      rejected: 0,
    };
    for (const row of rows) {
      typeCounts[row.type] = (typeCounts[row.type] ?? 0) + row._count._all;
      statusCounts[row.status] =
        (statusCounts[row.status] ?? 0) + row._count._all;
    }
    return {
      id: doc.id,
      name: doc.name,
      status: doc.status,
      pageCount: doc.pageCount,
      detectionCount: doc.detectionCount,
      typeCounts,
      statusCounts,
    };
  });

  // Known detection types come from DEFAULT_GROUND_FOR_TYPE (12 entries
  // in Phase 12.1). Custom-* types appear when a CustomRule fires; we
  // keep them as a separate "Custom" bucket on the UI.
  const knownTypes = Object.keys(DEFAULT_GROUND_FOR_TYPE);
  const typeCountsBatch: Record<string, number> = {};
  for (const t of knownTypes) typeCountsBatch[t] = 0;
  for (const row of byType) {
    typeCountsBatch[row.type] = row._count._all;
  }

  const statusCountsBatch: Record<string, number> = {
    accepted: 0,
    pending: 0,
    rejected: 0,
  };
  for (const row of byStatus) {
    statusCountsBatch[row.status] = row._count._all;
  }

  const props: StatsClientProps = {
    batchData,
    knownTypes,
    typeCountsBatch,
    statusCountsBatch,
    docStats,
  };

  return <StatsClient {...props} />;
}
