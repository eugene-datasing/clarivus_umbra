/**
 * Detection-type → pathway mapping for the benchmark scorer.
 *
 * Pathways partition the 20-entry detection-type vocabulary into four
 * reviewer-facing coverage classes: personal PII, commercial, governance,
 * and enforcement. The scorer reports per-pathway precision / recall so
 * that a prompt change affecting one pathway does not silently regress
 * another.
 */

export type Pathway = "personal" | "commercial" | "governance" | "enforcement";

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
  commercial: "commercial",
  "council-commercial": "commercial",
  negotiation: "commercial",
  "free-frank": "governance",
  "legal-privilege": "governance",
  confidential: "governance",
  "harassment-risk": "governance",
  "cultural-sensitivity": "governance",
  "law-enforcement": "enforcement",
  "safety-concern": "enforcement",
  "health-safety": "enforcement",
};

export const ALL_PATHWAYS: Pathway[] = [
  "personal",
  "commercial",
  "governance",
  "enforcement",
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
