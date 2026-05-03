/**
 * Default LGOIMA withholding ground for each detection type.
 *
 * When a reviewer changes a detection's type, the ground auto-updates to the
 * default for the new type — unless the reviewer has already manually set a
 * different ground.
 */

export const DEFAULT_GROUND_FOR_TYPE: Record<string, string> = {
  "personal-name": "s7_2a",
  phone: "s7_2a",
  "email-addr": "s7_2a",
  ird: "s7_2a",
  address: "s7_2a",
  "bank-account": "s7_2a",
  "nz-passport": "s7_2a",
  "nz-driver-licence": "s7_2a",
  "vehicle-reg": "s7_2a",
  nhi: "s7_2a",
  commercial: "s7_2bii",
  "free-frank": "s7_2fi",
  "legal-privilege": "s7_2g",
  confidential: "",
  negotiation: "s7_2i",
  "safety-concern": "s6d",
  "law-enforcement": "s6c",
  "council-commercial": "s7_2h",
  "harassment-risk": "s7_2fii",
  "cultural-sensitivity": "s7_2ba",
  "health-safety": "s7_2d",
  // Phase 12.1 (Umbra v2) — catch-all for personal-circumstance content
  // (medical conditions, health status, employment grievances, financial
  // hardship, etc. per REQ-006). No LGOIMA ground.
  "sensitive-context": "",
  manual: "",
};

/**
 * Return the default ground for a given detection type.
 * Returns "" for custom-* prefixed types or unknown types.
 */
export function getDefaultGroundForType(type: string): string {
  if (type.startsWith("custom-")) return "";
  return DEFAULT_GROUND_FOR_TYPE[type] ?? "";
}
