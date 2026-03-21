/**
 * Snapshot data functions — provides structured comparison between
 * detection states at different review milestones.
 *
 * Server-only: uses Prisma for database access.
 * For pure diff types and logic usable in client components,
 * import from "@/lib/data/snapshot-diff" instead.
 */

import { prisma } from "@/lib/db/prisma";
import type { Snapshot, SnapshotDetection } from "@/lib/pipeline/version-snapshot";
import { buildDiffs, summariseDiffs } from "./snapshot-diff";
import type { SnapshotComparison } from "./snapshot-diff";

// Re-export types and pure functions so server callers can use a single import
export { buildDiffs, summariseDiffs } from "./snapshot-diff";
export type {
  DiffKind,
  DetectionDiff,
  SnapshotComparisonSummary,
  SnapshotComparison,
} from "./snapshot-diff";

/**
 * Retrieve all snapshots for a document, with parsed detection data.
 */
export async function getDocumentSnapshots(docId: string): Promise<Snapshot[]> {
  const rows = await prisma.detectionSnapshot.findMany({
    where: { documentId: docId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    snapshotType: r.snapshotType,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    detections: r.detectionsJson as unknown as SnapshotDetection[],
  }));
}

/**
 * Build a structured comparison between the draft snapshot and
 * the final snapshot (or current live detections if no final snapshot exists).
 *
 * If no draft snapshot exists, the left side uses the earliest available
 * snapshot. If no snapshots exist at all, returns null.
 */
export async function getSnapshotComparison(
  docId: string,
): Promise<SnapshotComparison | null> {
  const snapshots = await getDocumentSnapshots(docId);

  if (snapshots.length === 0) return null;

  // Choose left = first draft snapshot (or first snapshot)
  const draftSnap = snapshots.find((s) => s.snapshotType === "draft") ?? snapshots[0];

  // Choose right = final snapshot, else current live detections
  const finalSnap = snapshots.find((s) => s.snapshotType === "final");

  let rightDetections: SnapshotDetection[];
  let rightLabel: string;

  if (finalSnap) {
    rightDetections = finalSnap.detections;
    rightLabel = "Final (Signed Off)";
  } else {
    // Fall back to current live detections
    const live = await prisma.detection.findMany({
      where: { documentId: docId },
      orderBy: [{ page: "asc" }, { posY: "asc" }],
    });
    rightDetections = live.map((d) => ({
      id: d.id,
      type: d.type,
      text: d.text,
      confidence: d.confidence,
      page: d.page,
      status: d.status,
      appliedGround: d.appliedGround,
      suggestedGround: d.suggestedGround,
    }));
    rightLabel = "Current State";
  }

  const leftLabel = draftSnap.snapshotType === "draft"
    ? "Draft (Submitted for Review)"
    : `Snapshot (${new Date(draftSnap.createdAt).toLocaleDateString("en-NZ")})`;

  const diffs = buildDiffs(draftSnap.detections, rightDetections);
  const summary = summariseDiffs(diffs);

  return { leftLabel, rightLabel, diffs, summary };
}
