/**
 * Detection history types and client-safe helpers.
 *
 * The actual Prisma query lives in `./detections.ts` (getDetectionHistory).
 * This module is intentionally kept free of server-only imports so it can
 * be used from "use client" components.
 */

export interface DetectionHistoryEntry {
  id: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string; // ISO string
}

/**
 * Format a field change into a human-readable description.
 * e.g. "Status: pending -> accepted"
 */
export function formatFieldChange(entry: DetectionHistoryEntry): string {
  const label = fieldLabel(entry.field);
  if (entry.previousValue && entry.newValue) {
    return `${label}: ${entry.previousValue} \u2192 ${entry.newValue}`;
  }
  if (entry.newValue) {
    return `${label}: set to ${entry.newValue}`;
  }
  if (entry.previousValue) {
    return `${label}: ${entry.previousValue} removed`;
  }
  return `${label} changed`;
}

/**
 * Convert a field key to a display label.
 */
function fieldLabel(field: string): string {
  switch (field) {
    case "status":
      return "Status";
    case "appliedGround":
      return "Withholding Ground";
    case "suggestedGround":
      return "Suggested Ground";
    case "confidence":
      return "Confidence";
    case "type":
      return "Type";
    case "text":
      return "Entity Text";
    case "reasoning":
      return "Reasoning";
    case "aiExplanation":
      return "AI Explanation";
    default:
      return field.charAt(0).toUpperCase() + field.slice(1);
  }
}

/**
 * Convert an ISO date string into a relative time description.
 * e.g. "2 hours ago", "just now", "3 days ago"
 */
export function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;

  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear} year${diffYear === 1 ? "" : "s"} ago`;
}
