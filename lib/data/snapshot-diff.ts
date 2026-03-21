/**
 * Snapshot diff types and pure comparison logic.
 *
 * This file has NO server-side imports so it can be safely used
 * from both server and client components.
 */

import type { SnapshotDetection } from "@/lib/pipeline/version-snapshot";

// ---- Comparison types ----

export type DiffKind = "unchanged" | "modified" | "added" | "removed";

export interface DetectionDiff {
  id: string;
  kind: DiffKind;
  /** Detection data from left side (null when added) */
  left: SnapshotDetection | null;
  /** Detection data from right side (null when removed) */
  right: SnapshotDetection | null;
  /** The "representative" detection for display (prefers right, falls back to left) */
  det: SnapshotDetection;
  statusChanged: boolean;
  groundChanged: boolean;
}

export interface SnapshotComparisonSummary {
  total: number;
  unchanged: number;
  modified: number;
  added: number;
  removed: number;
}

export interface SnapshotComparison {
  leftLabel: string;
  rightLabel: string;
  diffs: DetectionDiff[];
  summary: SnapshotComparisonSummary;
}

/**
 * Build per-detection diff entries from two detection arrays.
 * Pure function — no server-side dependencies.
 */
export function buildDiffs(
  leftDetections: SnapshotDetection[],
  rightDetections: SnapshotDetection[],
): DetectionDiff[] {
  const leftMap = new Map(leftDetections.map((d) => [d.id, d]));
  const rightMap = new Map(rightDetections.map((d) => [d.id, d]));
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);

  const results: DetectionDiff[] = [];

  for (const id of allIds) {
    const left = leftMap.get(id) ?? null;
    const right = rightMap.get(id) ?? null;

    const statusChanged = left !== null && right !== null && left.status !== right.status;
    const groundChanged = left !== null && right !== null && left.appliedGround !== right.appliedGround;

    let kind: DiffKind;
    if (left && !right) {
      kind = "removed";
    } else if (!left && right) {
      kind = "added";
    } else if (statusChanged || groundChanged) {
      kind = "modified";
    } else {
      kind = "unchanged";
    }

    results.push({
      id,
      kind,
      left,
      right,
      det: right ?? left!,
      statusChanged,
      groundChanged,
    });
  }

  // Sort: modified first, then added, removed, unchanged — each sub-group by page
  const kindOrder: Record<DiffKind, number> = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  results.sort((a, b) => {
    const ko = kindOrder[a.kind] - kindOrder[b.kind];
    if (ko !== 0) return ko;
    return a.det.page - b.det.page;
  });

  return results;
}

export function summariseDiffs(diffs: DetectionDiff[]): SnapshotComparisonSummary {
  let unchanged = 0;
  let modified = 0;
  let added = 0;
  let removed = 0;

  for (const d of diffs) {
    switch (d.kind) {
      case "unchanged": unchanged++; break;
      case "modified": modified++; break;
      case "added": added++; break;
      case "removed": removed++; break;
    }
  }

  return { total: diffs.length, unchanged, modified, added, removed };
}
