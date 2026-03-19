/**
 * Version Snapshot — WP5
 *
 * Captures detection states at review milestones (draft/final)
 * so reviewers can compare how decisions changed between rounds.
 */

import { prisma } from "@/lib/db/prisma";

export interface SnapshotDetection {
  id: string;
  type: string;
  text: string;
  confidence: number;
  page: number;
  status: string;
  appliedGround: string | null;
  suggestedGround: string | null;
}

export interface Snapshot {
  id: string;
  snapshotType: string;
  createdBy: string;
  createdAt: string;
  detections: SnapshotDetection[];
}

/**
 * Capture the current state of all detections for a document.
 */
export async function createSnapshot(
  documentId: string,
  snapshotType: "draft" | "final",
  createdBy: string,
): Promise<string> {
  const detections = await prisma.detection.findMany({
    where: { documentId },
    orderBy: [{ page: "asc" }, { posY: "asc" }],
  });

  const detectionsJson = detections.map((d) => ({
    id: d.id,
    type: d.type,
    text: d.text,
    confidence: d.confidence,
    page: d.page,
    status: d.status,
    appliedGround: d.appliedGround,
    suggestedGround: d.suggestedGround,
  }));

  const snapshot = await prisma.detectionSnapshot.create({
    data: {
      documentId,
      snapshotType,
      createdBy,
      detectionsJson: JSON.parse(JSON.stringify(detectionsJson)),
    },
  });

  return snapshot.id;
}

/**
 * Retrieve all snapshots for a document, including parsed detection data.
 */
export async function getSnapshots(documentId: string): Promise<Snapshot[]> {
  const rows = await prisma.detectionSnapshot.findMany({
    where: { documentId },
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
