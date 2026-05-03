import { getBatchTrayClusters } from "@/lib/data/detections";
import { getBatch } from "@/lib/data/batches";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { authorizeForBatch } from "@/lib/auth/authorize";
import BulkReviewClient from "./bulk-review-client";

/**
 * Phase 12.3 — Tray page.
 *
 * The "Bulk Review" route is now the canonical Tray surface for
 * medium-confidence detections (those that tier-routed to "pending"
 * in `lib/pipeline/process.ts`). The Tray groups detections by
 * (type, normalisedText) per batch and lets the reviewer approve /
 * reject whole clusters via `bulkAcceptBySimilar`.
 *
 * The URL stays `/batches/[id]/bulk-review` for back-compat. The
 * conceptual rename (Tray) is reflected in the page title + UI copy.
 */
export default async function BulkReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await authorizeForBatch(user, id);

  const [batchData, clusters] = await Promise.all([
    getBatch(id),
    getBatchTrayClusters(id),
  ]);

  if (!batchData) notFound();

  return (
    <BulkReviewClient
      batchId={id}
      batchReference={batchData.reference}
      batchStatus={batchData.status}
      totalDocuments={batchData.documentCount}
      clusters={clusters}
    />
  );
}
