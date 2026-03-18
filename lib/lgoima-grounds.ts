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
  // Section 6 — Conclusive
  { id: "s6a", section: "s6", reference: "s6(a)", label: "Law enforcement", description: "Release would prejudice the maintenance of the law", common: false, rare: false, requiresPI: false },
  { id: "s6b", section: "s6", reference: "s6(b)", label: "Personal safety", description: "Release would endanger the safety of any person", common: false, rare: false, requiresPI: false },
  { id: "s6c", section: "s6", reference: "s6(c)", label: "National security", description: "Release would prejudice the security or defence of New Zealand", common: false, rare: true, requiresPI: false },
  { id: "s6d", section: "s6", reference: "s6(d)", label: "Foreign government", description: "Information entrusted by a foreign government", common: false, rare: true, requiresPI: false },
  { id: "s6e", section: "s6", reference: "s6(e)", label: "Constitutional conventions", description: "Release would prejudice constitutional conventions", common: false, rare: true, requiresPI: false },
  // Section 7 — Balanced
  { id: "s7_2a", section: "s7", reference: "s7(2)(a)", label: "Personal privacy", description: "Protect the privacy of natural persons", common: true, requiresPI: true },
  { id: "s7_2bi", section: "s7", reference: "s7(2)(b)(i)", label: "Trade secrets", description: "Protect trade secrets", common: false, requiresPI: true },
  { id: "s7_2bii", section: "s7", reference: "s7(2)(b)(ii)", label: "Commercial position", description: "Protect commercial position of the supplier", common: true, requiresPI: true },
  { id: "s7_2c", section: "s7", reference: "s7(2)(c)", label: "Obligation of confidence", description: "Protect information subject to an obligation of confidence", common: true, requiresPI: true },
  { id: "s7_2d", section: "s7", reference: "s7(2)(d)", label: "Statutory restriction", description: "Disclosure prohibited by specified enactment", common: false, rare: true, requiresPI: true },
  { id: "s7_2e", section: "s7", reference: "s7(2)(e)", label: "Public health/safety", description: "Protect measures for public health or safety", common: false, rare: true, requiresPI: true },
  { id: "s7_2f", section: "s7", reference: "s7(2)(f)", label: "Free and frank opinions", description: "Maintain free and frank expression of opinions", common: true, requiresPI: true },
  { id: "s7_2g", section: "s7", reference: "s7(2)(g)", label: "Legal professional privilege", description: "Maintain legal professional privilege", common: true, requiresPI: true },
  { id: "s7_2h", section: "s7", reference: "s7(2)(h)", label: "Council commercial activities", description: "Enable council to carry out commercial activities", common: false, requiresPI: true },
  { id: "s7_2i", section: "s7", reference: "s7(2)(i)", label: "Council negotiations", description: "Enable council to negotiate without disadvantage", common: false, requiresPI: true },
  { id: "s7_2j", section: "s7", reference: "s7(2)(j)", label: "Incomplete negotiations", description: "Prevent prejudice to incomplete negotiations", common: false, requiresPI: true },
  // Section 17 — Refusal
  { id: "s17a", section: "s17", reference: "s17(a)", label: "Information not held", description: "Information does not exist or cannot be found", common: false, requiresPI: false },
  { id: "s17b", section: "s17", reference: "s17(b)", label: "Substantial collation", description: "Substantial collation or research required", common: false, requiresPI: false },
  { id: "s17c", section: "s17", reference: "s17(c)", label: "Contrary to enactment", description: "Disclosure contrary to specified enactment", common: false, requiresPI: false },
  { id: "s17e", section: "s17", reference: "s17(e)", label: "Frivolous or vexatious", description: "Request is frivolous or vexatious", common: false, requiresPI: false },
];

export function getGroundsBySection(section: "s6" | "s7" | "s17") {
  return lgoimaGrounds.filter((g) => g.section === section);
}

export function getGroundById(id: string) {
  return lgoimaGrounds.find((g) => g.id === id);
}
