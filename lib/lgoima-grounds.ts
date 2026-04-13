/**
 * LGOIMA statutory withholding grounds.
 *
 * Verified against: Local Government Official Information and Meetings Act 1987,
 * Version as at 15 January 2026 (PDF in repo), ss 6, 7, and 17.
 *
 * IMPORTANT: There is no s 6(e) in LGOIMA — that provision exists only in the
 * Official Information Act 1982. Do not add it.
 *
 * FORMAT CONVENTION:
 * - Database storage uses ID format (e.g. "s7_2a", "s7_2fi").
 * - The AI prompt displays reference format (e.g. "s7(2)(a)") for readability,
 *   but AI output is normalised to ID format before storage.
 * - getGroundLabelMap() keys by both formats for backward-compatible display.
 * - All user-facing writes are validated by Zod against validGroundIds in
 *   lib/validation/schemas.ts.
 */

export interface LGOIMAGround {
  id: string;
  section: "s6" | "s7" | "s17";
  reference: string;
  label: string;
  description: string;
  common: boolean;
  rare?: boolean;
  requiresPI: boolean;
}

export const lgoimaGrounds: LGOIMAGround[] = [
  // ---------------------------------------------------------------------------
  // Section 6 — Conclusive reasons for withholding (no public interest override)
  // ---------------------------------------------------------------------------
  { id: "s6a", section: "s6", reference: "s6(a)", label: "Security, defence, or international relations", description: "Making available would be likely to prejudice the security or defence of New Zealand or the international relations of the Government of New Zealand", common: false, rare: true, requiresPI: false },
  { id: "s6b", section: "s6", reference: "s6(b)", label: "Information entrusted by other government", description: "Making available would be likely to prejudice the entrusting of information to the Government of New Zealand on a basis of confidence by another government or international organisation", common: false, rare: true, requiresPI: false },
  { id: "s6c", section: "s6", reference: "s6(c)", label: "Maintenance of the law", description: "Making available would be likely to prejudice the maintenance of the law, including prevention, investigation, and detection of offences, and the right to a fair trial", common: false, rare: false, requiresPI: false },
  { id: "s6d", section: "s6", reference: "s6(d)", label: "Safety of any person", description: "Making available would be likely to endanger the safety of any person", common: false, rare: false, requiresPI: false },

  // ---------------------------------------------------------------------------
  // Section 7 — Other reasons for withholding (subject to public interest test)
  // ---------------------------------------------------------------------------
  { id: "s7_2a", section: "s7", reference: "s7(2)(a)", label: "Privacy of natural persons", description: "Protect the privacy of natural persons, including that of deceased natural persons", common: true, requiresPI: true },
  { id: "s7_2bi", section: "s7", reference: "s7(2)(b)(i)", label: "Trade secrets", description: "Protect information where making available would disclose a trade secret", common: false, requiresPI: true },
  { id: "s7_2bii", section: "s7", reference: "s7(2)(b)(ii)", label: "Commercial position", description: "Protect information where making available would be likely unreasonably to prejudice the commercial position of the supplier or subject", common: true, requiresPI: true },
  { id: "s7_2ba", section: "s7", reference: "s7(2)(ba)", label: "Tikanga Māori / wāhi tapu", description: "In resource consent/RMA contexts, avoid serious offence to tikanga Māori or disclosure of the location of wāhi tapu", common: false, requiresPI: true },
  { id: "s7_2ci", section: "s7", reference: "s7(2)(c)(i)", label: "Prejudice to supply of confidential information", description: "Protect information subject to obligation of confidence where release would prejudice supply of similar information, and continued supply is in the public interest", common: true, requiresPI: true },
  { id: "s7_2cii", section: "s7", reference: "s7(2)(c)(ii)", label: "Damage to public interest", description: "Protect information subject to obligation of confidence where release would likely otherwise damage the public interest", common: false, requiresPI: true },
  { id: "s7_2d", section: "s7", reference: "s7(2)(d)", label: "Health or safety of the public", description: "Avoid prejudice to measures protecting the health or safety of members of the public", common: false, requiresPI: true },
  { id: "s7_2e", section: "s7", reference: "s7(2)(e)", label: "Material loss prevention", description: "Avoid prejudice to measures that prevent or mitigate material loss to members of the public", common: false, rare: true, requiresPI: true },
  { id: "s7_2fi", section: "s7", reference: "s7(2)(f)(i)", label: "Free and frank opinions", description: "Maintain effective conduct of public affairs through free and frank expression of opinions by or between or to members, officers, or employees of any local authority", common: true, requiresPI: true },
  { id: "s7_2fii", section: "s7", reference: "s7(2)(f)(ii)", label: "Protection from improper pressure or harassment", description: "Protect members, officers, employees, and persons from improper pressure or harassment", common: false, requiresPI: true },
  { id: "s7_2g", section: "s7", reference: "s7(2)(g)", label: "Legal professional privilege", description: "Maintain legal professional privilege", common: true, requiresPI: true },
  { id: "s7_2h", section: "s7", reference: "s7(2)(h)", label: "Local authority commercial activities", description: "Enable local authority to carry out, without prejudice or disadvantage, commercial activities", common: false, requiresPI: true },
  { id: "s7_2i", section: "s7", reference: "s7(2)(i)", label: "Negotiations", description: "Enable local authority to carry on, without prejudice or disadvantage, negotiations (including commercial and industrial negotiations)", common: false, requiresPI: true },
  { id: "s7_2j", section: "s7", reference: "s7(2)(j)", label: "Improper gain or advantage", description: "Prevent the disclosure or use of official information for improper gain or improper advantage", common: false, requiresPI: true },

  // ---------------------------------------------------------------------------
  // Section 17 — Refusal of requests
  // ---------------------------------------------------------------------------
  { id: "s17a", section: "s17", reference: "s17(a)", label: "Good reason to withhold (s6/s7)", description: "By virtue of section 6 or section 7, there is good reason for withholding the information", common: false, requiresPI: false },
  { id: "s17b", section: "s17", reference: "s17(b)", label: "NCND (section 8)", description: "By virtue of section 8, the local authority does not confirm or deny the existence or non-existence of the information", common: false, requiresPI: false },
  { id: "s17ci", section: "s17", reference: "s17(c)(i)", label: "Contrary to enactment", description: "Making available would be contrary to the provisions of a specified enactment", common: false, requiresPI: false },
  { id: "s17cii", section: "s17", reference: "s17(c)(ii)", label: "Contempt of court", description: "Making available would constitute contempt of court or of the House of Representatives", common: false, requiresPI: false },
  { id: "s17d", section: "s17", reference: "s17(d)", label: "Publicly available", description: "The information requested is or will soon be publicly available", common: false, requiresPI: false },
  { id: "s17e", section: "s17", reference: "s17(e)", label: "Information not held", description: "The document alleged to contain the information does not exist or cannot be found", common: false, requiresPI: false },
  { id: "s17f", section: "s17", reference: "s17(f)", label: "Substantial collation or research", description: "The information cannot be made available without substantial collation or research", common: false, requiresPI: false },
  { id: "s17g", section: "s17", reference: "s17(g)", label: "Not held, no known holder", description: "The information is not held and there are no grounds for believing it is held elsewhere", common: false, requiresPI: false },
  { id: "s17h", section: "s17", reference: "s17(h)", label: "Frivolous or vexatious", description: "The request is frivolous or vexatious or the information requested is trivial", common: false, requiresPI: false },
];

export function getGroundsBySection(section: "s6" | "s7" | "s17") {
  return lgoimaGrounds.filter((g) => g.section === section);
}

export function getGroundById(id: string) {
  return lgoimaGrounds.find((g) => g.id === id);
}

export function getGroundByReference(ref: string): LGOIMAGround | undefined {
  return lgoimaGrounds.find((g) => g.reference === ref);
}

/**
 * Normalise a ground value to ID format.
 * Accepts either ID (s7_2a) or reference (s7(2)(a)) format.
 * Returns the ID format, or the original string if not recognised.
 */
export function normaliseGroundToId(value: string): string {
  const byId = lgoimaGrounds.find((g) => g.id === value);
  if (byId) return byId.id;
  const byRef = lgoimaGrounds.find((g) => g.reference === value);
  if (byRef) return byRef.id;
  return value;
}

/**
 * Return a label lookup map keyed by both ID and reference format.
 * This supports the mixed-format values stored in the database
 * (appliedGround uses IDs, suggestedGround uses references).
 */
export function getGroundLabelMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const g of lgoimaGrounds) {
    map[g.reference] = g.label;
    map[g.id] = g.label;
  }
  return map;
}
