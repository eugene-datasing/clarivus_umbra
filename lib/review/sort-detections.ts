/**
 * Sort comparator for the review-UI detections list.
 *
 * Slice B (viewer rework, April 2026) swapped from a `documentContent`
 * walker — which was tied to the HTML-branch paragraph tree — to a
 * direct comparator on the coordinates both the HTML and PDF viewers
 * agree on: `(page, posY, id)`.
 *
 * Order:
 *   1. `page` ascending — top of doc first.
 *   2. `position.y` ascending — top of page first, percentage-space.
 *   3. `id.localeCompare` tiebreak — keeps ordering stable when
 *      detections share (page, posY). Most commonly the handful of
 *      unresolvable-bbox detections where posY = 0; without the
 *      tiebreak, React keys for those rows shuffle between re-renders.
 *
 * Exported as a plain comparator (returning -1 / 0 / 1 semantics) so
 * it drops straight into `Array.prototype.sort`.
 */
interface Sortable {
  id: string;
  page: number;
  position: { y: number };
}

export function compareDetectionsByPosition(a: Sortable, b: Sortable): number {
  if (a.page !== b.page) return a.page - b.page;
  if (a.position.y !== b.position.y) return a.position.y - b.position.y;
  return a.id.localeCompare(b.id);
}
