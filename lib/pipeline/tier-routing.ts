/**
 * Tier-routing helper (Phase 12.2 — Umbra v2).
 *
 * Decides at detection-write time whether a detection lands as
 * `accepted` (auto-redacted, no review), `pending` (review tray), or
 * `rejected` (audit trail only). Source-aware: deterministic sources
 * (pattern / label-adjacent / custom-rule / manual) always tier "high"
 * regardless of confidence number, because they're either deterministic
 * shape matches or reviewer-explicit. AI-derived sources (ai /
 * entity-propagation) tier by confidence against the configured
 * thresholds.
 *
 * The mapping from tier → status is the caller's job (process.ts
 * applies it at the prisma.detection.create site).
 */
import type { AutoRedactConfig } from "@/lib/data/settings";

export type Tier = "high" | "medium" | "low";

export interface TierRoutingDetection {
  source: string;
  confidence: number;
}

const DETERMINISTIC_SOURCES = new Set([
  "pattern",
  "label-adjacent",
  "custom-rule",
  "manual",
]);

/**
 * Bucket a detection into a tier given the config.
 *
 * - Deterministic sources (pattern / label-adjacent / custom-rule /
 *   manual) → "high" unconditionally. The shape match itself is the
 *   evidence.
 * - AI-derived sources (ai / entity-propagation / section-marker /
 *   anything not in the deterministic set) tier by confidence:
 *     - confidence ≥ config.highThreshold   → "high"
 *     - confidence ≥ config.mediumThreshold → "medium"
 *     - else                                 → "low"
 */
export function bucketConfidence(
  detection: TierRoutingDetection,
  config: AutoRedactConfig,
): Tier {
  if (DETERMINISTIC_SOURCES.has(detection.source)) return "high";
  if (detection.confidence >= config.highThreshold) return "high";
  if (detection.confidence >= config.mediumThreshold) return "medium";
  return "low";
}

/**
 * Map a tier to the initial Detection.status to write. The "low" tier
 * lands as `rejected` so the audit trail records that the AI flagged
 * something but the policy filtered it out — never silently dropped.
 */
export function tierToStatus(tier: Tier): "accepted" | "pending" | "rejected" {
  switch (tier) {
    case "high":
      return "accepted";
    case "medium":
      return "pending";
    case "low":
      return "rejected";
  }
}
