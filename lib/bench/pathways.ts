/**
 * Detection-type → pathway mapping for the benchmark scorer.
 *
 * Phase 12.1 (Umbra v2) — collapsed from the v1 four-pathway split
 * (personal / commercial / governance / enforcement) to two pathways
 * matching the privacy-only scope:
 *
 *   - "personal" — deterministic-ish PII identifiers (names, phone,
 *     email, IRD, NHI, address, bank account, passport, driver licence,
 *     vehicle reg).
 *   - "context"  — the new sensitive-context bucket: medical /
 *     employment / financial-hardship / family-violence prose +
 *     internal employee identifiers + salary values.
 *
 * `manual` and the `custom-*` types stay unmapped (no pathway), per
 * the v1 convention — the scorer counts them in the overall
 * precision/recall but excludes them from per-pathway breakdowns.
 *
 * The scorer reports per-pathway precision / recall so that a prompt
 * change affecting one pathway does not silently regress another.
 */

export type Pathway = "personal" | "context";

export const TYPE_TO_PATHWAY: Record<string, Pathway> = {
  "personal-name": "personal",
  phone: "personal",
  "email-addr": "personal",
  ird: "personal",
  address: "personal",
  "bank-account": "personal",
  "nz-passport": "personal",
  nhi: "personal",
  "nz-driver-licence": "personal",
  "vehicle-reg": "personal",
  "sensitive-context": "context",
};

export const ALL_PATHWAYS: Pathway[] = [
  "personal",
  "context",
];

/**
 * Returns the pathway for a detection type, or undefined for unknown
 * types (e.g. custom rules, manual, or future additions not yet in
 * the map). Callers should treat undefined as "not counted against any
 * pathway aggregate" — the overall precision/recall still include it.
 */
export function pathwayFor(type: string): Pathway | undefined {
  return TYPE_TO_PATHWAY[type];
}
