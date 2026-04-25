/**
 * Visual-overlay deduplication for the PDF review panes.
 *
 * Multiple `Detection` rows can share an exact bounding box on the
 * same page — e.g. the phone regex emits both `021 544 908` and the
 * same number with an embedded `\n` from a soft line wrap, or the
 * bank-account regex matches `12-3056-0789123-00` while the phone
 * regex misclassifies the trailing `0789123-00` substring. The
 * pipeline-level dedup keys on `(page, type, text, posY_rounded)` so
 * detections with differing `text` or `type` survive — which is
 * correct for sidebar enumeration and audit, but produces a stack of
 * translucent overlays at the same pixel coordinates on the canvas.
 * Two `bg-{colour}/25` fills composite to a visibly darker shade than
 * one, breaking the LEFT-pane status convention (red=accept,
 * yellow=pending, green=reject).
 *
 * This helper merges raw detection entries by exact bbox match (page,
 * posX, posY, posW, posH all equal) and computes a single rendering
 * group per stack. Render-time only — detection data and the sidebar
 * are unaffected. Pipeline dedup gaps (Mechanism A whitespace
 * variants, Mechanism B substring overlaps) are separate architectural
 * follow-ups.
 *
 * Status priority: `accepted > rejected > pending`. The "most-actioning"
 * status determines the merged group's visual because it determines the
 * eventual export behaviour — a group with one accepted + one pending
 * will redact, so the overlay should reflect that.
 *
 * Click identity: the lowest-`id` detection in the group is the
 * "primary". Clicking the merged overlay selects the primary; the
 * sidebar continues to list every detection in the group individually,
 * and selecting any of them from the sidebar still highlights the
 * merged overlay (see `detectionIds` for the membership check on the
 * caller side).
 */

export interface MergeableDetection {
  id: string;
  type: string;
  text: string;
  confidence: number;
  page: number;
  /** 0-100 percentage of the canvas width. */
  posX: number;
  posY: number;
  posW: number;
  posH: number;
  /** "pending" / "accepted" / "rejected" — anything else falls through to "pending". */
  status: string;
}

export interface MergedOverlay {
  /** Lowest-id detection in the group; click target. */
  primaryId: string;
  /** Every detection id in the group; for sidebar-selection-driven highlight. */
  detectionIds: string[];
  /** Distinct types in stable order (first occurrence per id-sort). */
  types: string[];
  /** Primary's text — used for ARIA / title / popover. */
  text: string;
  /** Primary's confidence — used for the title attribute. */
  confidence: number;
  page: number;
  posX: number;
  posY: number;
  posW: number;
  posH: number;
  /** Priority-resolved status. */
  status: "accepted" | "rejected" | "pending";
}

const STATUS_PRIORITY: Readonly<Record<string, number>> = {
  accepted: 3,
  rejected: 2,
  pending: 1,
};

/**
 * Resolve the merged status by priority. Unknown statuses are treated
 * as `pending` so the helper degrades safely on data drift.
 */
export function dominantStatus(
  detections: ReadonlyArray<{ status: string }>,
): "accepted" | "rejected" | "pending" {
  let bestPriority = 0;
  let best: "accepted" | "rejected" | "pending" = "pending";
  for (const d of detections) {
    const p = STATUS_PRIORITY[d.status] ?? STATUS_PRIORITY.pending;
    if (p > bestPriority) {
      bestPriority = p;
      best = (d.status as "accepted" | "rejected" | "pending") in STATUS_PRIORITY
        ? (d.status as "accepted" | "rejected" | "pending")
        : "pending";
    }
  }
  return best;
}

/** Stable bbox key — page + four bbox values. Exact match only. */
function bboxKey(d: MergeableDetection): string {
  return `${d.page}|${d.posX}|${d.posY}|${d.posW}|${d.posH}`;
}

/**
 * Group detections by exact bbox match. Single-detection groups pass
 * through unchanged; multi-detection groups collapse to one merged
 * overlay with priority-resolved status, distinct types preserved,
 * and the lowest-id detection chosen as primary.
 *
 * Output ordering matches the order in which group keys are first
 * encountered in the input, which is deterministic given the input
 * order.
 */
export function mergeByBbox(detections: MergeableDetection[]): MergedOverlay[] {
  const groups = new Map<string, MergeableDetection[]>();
  for (const d of detections) {
    const key = bboxKey(d);
    const list = groups.get(key);
    if (list) {
      list.push(d);
    } else {
      groups.set(key, [d]);
    }
  }

  return Array.from(groups.values()).map((group) => {
    const sorted = [...group].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const primary = sorted[0];

    const seenTypes = new Set<string>();
    const types: string[] = [];
    for (const d of sorted) {
      if (!seenTypes.has(d.type)) {
        seenTypes.add(d.type);
        types.push(d.type);
      }
    }

    return {
      primaryId: primary.id,
      detectionIds: sorted.map((d) => d.id),
      types,
      text: primary.text,
      confidence: primary.confidence,
      page: primary.page,
      posX: primary.posX,
      posY: primary.posY,
      posW: primary.posW,
      posH: primary.posH,
      status: dominantStatus(group),
    };
  });
}
