/**
 * seed-content.ts — Populate contentJson for documents that have
 * detections but no content yet.
 *
 * Run with:
 *   DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx tsx scripts/seed-content.ts
 */

import { PrismaClient } from "../lib/generated/prisma/client";
import type { Prisma } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type InputJsonValue = Prisma.InputJsonValue;

const connectionString = process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5434/veil";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/* ================================================================== */
/*  DETECTION DEFINITIONS                                              */
/* ================================================================== */

const newDetections: Array<Prisma.DetectionUncheckedCreateInput> = [
  // doc-004: Consultation submission (req-001: Coastal Walkway)
  { id: "det-036", documentId: "doc-004", type: "personal-name", text: "Emily Johnson", confidence: 96, page: 1, posX: 150, posY: 80, posW: 150, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Name of a public submitter.", piConsideration: "Personal privacy of a private individual.", aiExplanation: "Personal name in a public consultation submission.", source: "ai" },
  { id: "det-037", documentId: "doc-004", type: "address", text: "156 Marine Parade, Coastal Heights 4312", confidence: 94, page: 1, posX: 150, posY: 105, posW: 320, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Residential address of submitter.", piConsideration: "No public interest in disclosing residential addresses.", aiExplanation: "NZ residential address in standard format.", source: "ai" },
  { id: "det-038", documentId: "doc-004", type: "email-addr", text: "e.johnson@xtra.co.nz", confidence: 98, page: 1, posX: 150, posY: 130, posW: 220, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Personal email address.", piConsideration: "Personal correspondence address.", aiExplanation: "Personal email with xtra.co.nz domain.", source: "ai" },
  { id: "det-039", documentId: "doc-004", type: "phone", text: "027 556 8821", confidence: 99, page: 1, posX: 150, posY: 155, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Personal mobile number.", piConsideration: "No public interest in disclosing phone numbers.", aiExplanation: "NZ mobile phone number (027 prefix).", source: "ai" },

  // doc-006: Internal memo (req-001: Coastal Walkway)
  { id: "det-040", documentId: "doc-006", type: "commercial", text: "$5.6M — a $800,000 (17%) overrun", confidence: 82, page: 1, posX: 80, posY: 200, posW: 400, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Budget overrun information.", piConsideration: "Premature disclosure could prejudice negotiations.", aiExplanation: "Project budget overrun discussed in internal memo.", source: "ai" },
  { id: "det-041", documentId: "doc-006", type: "free-frank", text: "Specifically, deferring the Mangati Stream culvert renewal ($820,000) would cover the Coastal Walkway overrun and avoid public controversy about scaling back the walkway project mid-construction.", confidence: 85, page: 1, posX: 80, posY: 280, posW: 520, posH: 44, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "Frank staff advice on budget strategy.", piConsideration: "Free and frank advice to decision-makers.", aiExplanation: "Staff recommendation on politically sensitive budget choices.", source: "ai" },
  { id: "det-042", documentId: "doc-006", type: "free-frank", text: "If we report the overrun to the full council, it will almost certainly leak to the media. The opposition councillors will use this to attack the Mayor's project management record.", confidence: 88, page: 1, posX: 80, posY: 360, posW: 520, posH: 44, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "Political risk assessment.", piConsideration: "Strong free and frank opinion about council politics.", aiExplanation: "Staff assessment of political risk and media attention.", source: "ai" },

  // doc-007: Contractor quote (req-001)
  { id: "det-043", documentId: "doc-007", type: "commercial", text: "$890,000 (excl GST)", confidence: 91, page: 1, posX: 200, posY: 180, posW: 200, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Contractor pricing.", piConsideration: "Prejudice future procurement.", aiExplanation: "Base contract price from contractor.", source: "ai" },
  { id: "det-044", documentId: "doc-007", type: "personal-name", text: "Tony Richardson", confidence: 90, page: 1, posX: 180, posY: 320, posW: 160, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Contractor project manager - professional role.", source: "ai", reviewedBy: "u-003", reviewedAt: new Date("2026-03-17T10:00:00") },
  { id: "det-045", documentId: "doc-007", type: "phone", text: "021 445 9923", confidence: 97, page: 1, posX: 380, posY: 345, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Personal mobile number.", piConsideration: "Personal contact details.", aiExplanation: "Mobile phone number for contractor employee.", source: "ai" },
  { id: "det-046", documentId: "doc-007", type: "personal-name", text: "Melissa Grant", confidence: 88, page: 1, posX: 180, posY: 370, posW: 150, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Site supervisor - professional role.", source: "ai", reviewedBy: "u-003", reviewedAt: new Date("2026-03-17T10:00:00") },

  // doc-017: Council deliberation (req-002: Devon St sale)
  { id: "det-204", documentId: "doc-017", type: "commercial", text: "Offer A: $3.8M conditional", confidence: 79, page: 1, posX: 120, posY: 250, posW: 250, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Commercial offer details.", piConsideration: "Could prejudice future transactions.", aiExplanation: "Specific offer amount from property transaction.", source: "ai" },
  { id: "det-205", documentId: "doc-017", type: "commercial", text: "Offer B: $4.1M unconditional (Maxwell Development Group)", confidence: 85, page: 1, posX: 120, posY: 275, posW: 420, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Accepted offer with purchaser.", piConsideration: "Commercial details.", aiExplanation: "Specific offer amount and purchaser identity.", source: "ai" },
  { id: "det-206", documentId: "doc-017", type: "commercial", text: "Offer C: $3.95M conditional with leaseback", confidence: 77, page: 1, posX: 120, posY: 300, posW: 380, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Commercial offer details.", piConsideration: "Transaction details.", aiExplanation: "Specific offer terms including leaseback.", source: "ai" },
  { id: "det-207", documentId: "doc-017", type: "free-frank", text: "Offer B given it's from Gregory Maxwell, who is a donor to the Mayor's election campaign", confidence: 83, page: 2, posX: 80, posY: 180, posW: 520, posH: 44, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "Councillor's frank questioning of conflict of interest.", piConsideration: "Public interest vs deliberative comment.", aiExplanation: "Councillor linking property offer to political donations.", source: "ai" },
  { id: "det-208", documentId: "doc-017", type: "free-frank", text: "I'm uncomfortable proceeding with this sale before the community has had a chance to provide input. This is a significant asset disposal and the public excluded process feels like we're hiding something.", confidence: 86, page: 2, posX: 80, posY: 260, posW: 520, posH: 66, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "Councillor's frank opinion on process.", piConsideration: "Deliberative comment in public-excluded meeting.", aiExplanation: "Cr. Bridges expressing concern about transparency.", source: "ai" },

  // doc-018: Offer letter (req-002)
  { id: "det-209", documentId: "doc-018", type: "commercial", text: "$4,100,000 (Four million one hundred thousand dollars) plus GST (if any)", confidence: 92, page: 1, posX: 150, posY: 180, posW: 500, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Purchase price.", piConsideration: "Commercial transaction amount.", aiExplanation: "Specific purchase offer for council land.", source: "ai" },
  { id: "det-210", documentId: "doc-018", type: "commercial", text: "six-storey mixed-use development with ground floor retail and 42 residential apartments", confidence: 78, page: 1, posX: 150, posY: 280, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Development plans - likely public via consent process.", source: "ai", reviewedBy: "u-005", reviewedAt: new Date("2026-03-15T14:30:00") },
  { id: "det-211", documentId: "doc-018", type: "commercial", text: "The purchaser has secured pre-approval for development finance from ANZ Bank totalling $18.5M", confidence: 84, page: 1, posX: 150, posY: 340, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Confidential financing details.", piConsideration: "Private commercial financing.", aiExplanation: "Specific financing amount and lender.", source: "ai" },
  { id: "det-212", documentId: "doc-018", type: "personal-name", text: "Gregory Maxwell", confidence: 94, page: 1, posX: 180, posY: 400, posW: 160, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Company director - commercial capacity, public record.", source: "ai", reviewedBy: "u-005", reviewedAt: new Date("2026-03-15T14:30:00") },
  { id: "det-213", documentId: "doc-018", type: "email-addr", text: "g.maxwell@maxwelldev.co.nz", confidence: 96, page: 1, posX: 180, posY: 425, posW: 280, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Business email - corporate contact.", source: "ai", reviewedBy: "u-005", reviewedAt: new Date("2026-03-15T14:30:00") },
  { id: "det-214", documentId: "doc-018", type: "phone", text: "027 334 5512", confidence: 98, page: 1, posX: 180, posY: 450, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Personal mobile number.", piConsideration: "Although used for business, personal mobile.", aiExplanation: "Mobile phone number (027 prefix).", source: "ai" },

  // doc-019: Email thread (req-002)
  { id: "det-215", documentId: "doc-019", type: "commercial", text: "Gregory Maxwell has indicated he's prepared to increase his offer to $4.2M if we can settle by end of March rather than the standard 90-day period", confidence: 87, page: 1, posX: 80, posY: 150, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Negotiation details.", piConsideration: "Commercial negotiation information.", aiExplanation: "Conditional higher offer in ongoing negotiations.", source: "ai" },
  { id: "det-216", documentId: "doc-019", type: "free-frank", text: "I'm aware of the political optics given Maxwell's previous donations to the Mayor's campaign", confidence: 81, page: 1, posX: 80, posY: 230, posW: 520, posH: 22, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "Political sensitivity acknowledgment.", piConsideration: "Staff candid comment about politics.", aiExplanation: "Property Manager's frank political observation.", source: "ai" },
  { id: "det-217", documentId: "doc-019", type: "free-frank", text: "Accelerating this for an extra $100K would look terrible if it leaked to the media", confidence: 84, page: 1, posX: 80, posY: 320, posW: 520, posH: 44, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "CEO's strategic media risk advice.", piConsideration: "Free and frank executive advice on reputational risk.", aiExplanation: "CEO's candid assessment of media risk.", source: "ai" },

  // doc-021: Insurance claim (req-007: Flood)
  { id: "det-218", documentId: "doc-021", type: "commercial", text: "Claim amount: $1,450,000", confidence: 88, page: 1, posX: 150, posY: 200, posW: 220, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Insurance claim for public infrastructure - public expenditure.", source: "ai", reviewedBy: "u-003", reviewedAt: new Date("2026-03-18T11:00:00") },
  { id: "det-219", documentId: "doc-021", type: "commercial", text: "Insurer concern: $380,000 of the claim relates to pipe sections that show evidence of pre-existing deterioration. The insurer has indicated this portion may not be covered under the policy.", confidence: 85, page: 1, posX: 80, posY: 250, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Insurance negotiation position.", piConsideration: "Could undermine council's negotiating position.", aiExplanation: "Details of coverage dispute with specific amounts.", source: "ai" },
  { id: "det-220", documentId: "doc-021", type: "commercial", text: "Claim amount: $180,000", confidence: 86, page: 1, posX: 150, posY: 380, posW: 220, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Public infrastructure repair - public expenditure.", source: "ai", reviewedBy: "u-003", reviewedAt: new Date("2026-03-18T11:00:00") },
  { id: "det-221", documentId: "doc-021", type: "legal-privilege", text: "legal counsel to dispute the insurer's position on Claim 1", confidence: 78, page: 2, posX: 80, posY: 100, posW: 450, posH: 22, suggestedGround: "s7_2g", appliedGround: "s7_2g", status: "accepted", reasoning: "Reference to legal advice.", piConsideration: "Legal professional privilege.", aiExplanation: "Engaging legal counsel for insurance dispute.", source: "ai" },
  { id: "det-222", documentId: "doc-021", type: "legal-privilege", text: "External legal advice from Chapman Tripp (4 March 2026) supports the broker's position and estimates a 70% likelihood of recovering the full $1.45M if the matter proceeds to dispute resolution.", confidence: 91, page: 2, posX: 80, posY: 150, posW: 520, posH: 44, suggestedGround: "s7_2g", appliedGround: "s7_2g", status: "accepted", reasoning: "Substance of legal advice.", piConsideration: "Legal professional privilege protects advice.", aiExplanation: "Summary of legal advice including litigation prospects.", source: "ai" },
  { id: "det-223", documentId: "doc-021", type: "free-frank", text: "If the insurer reduces Claim 1 by $380,000, the council will need to fund this from the emergency works budget or seek a budget variation.", confidence: 74, page: 2, posX: 80, posY: 280, posW: 520, posH: 44, suggestedGround: "s7_2fi", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Factual financial information, not free and frank opinion.", source: "ai", reviewedBy: "u-003", reviewedAt: new Date("2026-03-18T11:00:00") },

  // doc-022: Email with insurer (req-007)
  { id: "det-224", documentId: "doc-022", type: "commercial", text: "approximately 30% of the damaged pipe sections show signs of corrosion and deterioration consistent with age-related degradation rather than acute flood damage", confidence: 80, page: 1, posX: 80, posY: 180, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Insurer's technical assessment.", piConsideration: "Could prejudice negotiations.", aiExplanation: "Insurer's engineering basis for dispute.", source: "ai" },
  { id: "det-225", documentId: "doc-022", type: "commercial", text: "We propose to settle the claim at $1,070,000 (full claim less the $380,000 attributable to pre-existing condition)", confidence: 89, page: 1, posX: 80, posY: 260, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Settlement offer in active dispute.", piConsideration: "Active negotiation - could prejudice bargaining.", aiExplanation: "Specific settlement offer with calculation.", source: "ai" },
  { id: "det-226", documentId: "doc-022", type: "commercial", text: "Our own engineering consultant (GHD Ltd) has assessed the failure and attributes it entirely to the extreme hydraulic loads during the 14-15 February event", confidence: 77, page: 2, posX: 80, posY: 150, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Technical counter-position - factual engineering assessment.", source: "ai", reviewedBy: "u-007", reviewedAt: new Date("2026-03-18T14:00:00") },
  { id: "det-227", documentId: "doc-022", type: "free-frank", text: "While we acknowledge some sections showed age-related wear, this is normal for a 40-year-old pipeline and does not constitute 'gradual deterioration' within the meaning of the policy exclusion", confidence: 81, page: 2, posX: 80, posY: 230, posW: 520, posH: 44, suggestedGround: "s7_2fi", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Legal argument, not free and frank opinion.", source: "ai", reviewedBy: "u-007", reviewedAt: new Date("2026-03-18T14:00:00") },
  { id: "det-228", documentId: "doc-022", type: "legal-privilege", text: "Our policy does not cover 'repair or replacement made necessary by wear, tear, gradual deterioration, rust, corrosion' (see Policy Schedule, Section 3.2.4)", confidence: 69, page: 3, posX: 80, posY: 100, posW: 520, posH: 44, suggestedGround: "s7_2g", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Quote from policy - contractual term, not legal advice.", source: "ai", reviewedBy: "u-005", reviewedAt: new Date("2026-03-19T09:00:00") },
  { id: "det-229", documentId: "doc-022", type: "legal-privilege", text: "We have instructed Chapman Tripp to act on the council's behalf", confidence: 75, page: 4, posX: 80, posY: 180, posW: 450, posH: 22, suggestedGround: "s7_2g", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Fact of legal representation - not privileged.", source: "ai", reviewedBy: "u-005", reviewedAt: new Date("2026-03-19T09:00:00") },

  // doc-023: Repair costs (req-007)
  { id: "det-230", documentId: "doc-023", type: "commercial", text: "$215,000", confidence: 72, page: 1, posX: 200, posY: 120, posW: 100, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Public expenditure information.", source: "ai", reviewedBy: "u-008", reviewedAt: new Date("2026-03-17T15:00:00") },
  { id: "det-231", documentId: "doc-023", type: "commercial", text: "Cost: $1,320,000", confidence: 76, page: 1, posX: 150, posY: 220, posW: 180, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Infrastructure repair cost - public expenditure.", source: "ai", reviewedBy: "u-008", reviewedAt: new Date("2026-03-17T15:00:00") },
  { id: "det-232", documentId: "doc-023", type: "commercial", text: "Downer NZ Ltd — quoted $1.32M + contingency", confidence: 83, page: 1, posX: 150, posY: 250, posW: 420, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Specific contractor quote.", piConsideration: "Commercially sensitive pricing.", aiExplanation: "Contractor's quote - could prejudice future procurement.", source: "ai" },
  { id: "det-233", documentId: "doc-023", type: "personal-name", text: "ElectroServ Ltd", confidence: 45, page: 1, posX: 150, posY: 340, posW: 150, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Company name, not a personal name.", source: "ai", reviewedBy: "u-008", reviewedAt: new Date("2026-03-17T15:00:00") },
];

/* ================================================================== */
/*  CONTENT GENERATORS (continued in next part due to length limits)  */
/* ================================================================== */

async function main() {
  console.log("Seeding document content...\n");

  // Insert all new detections
  console.log("Inserting new detections...");
  for (const det of newDetections) {
    await prisma.detection.upsert({
      where: { id: det.id },
      update: det as Prisma.DetectionUpdateInput,
      create: det,
    });
  }
  console.log(`  ✓ Inserted ${newDetections.length} detections\n`);

  // Content for doc-004 (consultation submission)
  const doc004: InputJsonValue = [
    { heading: "Public Consultation Submission", segments: [{ text: "COASTAL WALKWAY EXTENSION PROJECT\nSubmission #047\nDate: 28 February 2026" }] },
    { heading: "Submitter Details", segments: [
      { text: "Name: " },
      { text: "Emily Johnson", detectionId: "det-036" },
      { text: "\nAddress: " },
      { text: "156 Marine Parade, Coastal Heights 4312", detectionId: "det-037" },
      { text: "\nEmail: " },
      { text: "e.johnson@xtra.co.nz", detectionId: "det-038" },
      { text: "\nPhone: " },
      { text: "027 556 8821", detectionId: "det-039" },
    ] },
    { heading: "Submission", segments: [{ text: "I support the Coastal Walkway Extension Project. As a regular walker and cyclist, I believe this infrastructure will significantly improve safety and accessibility along our beautiful coastline.\n\nHowever, I have some concerns about the proposed route through the ecological reserve between chainage 1800-2200. This area is home to several threatened bird species including the New Zealand dotterel (tūturiwhatu). I urge the council to:\n\n1. Commission an ecological impact assessment before finalising the route\n2. Consider a boardwalk design through this section to minimise ground disturbance\n3. Implement seasonal construction restrictions during nesting periods (September-March)\n\nI am available to speak to my submission at a hearing if required." }] },
    { segments: [{ text: "\n---\nSubmission received: 28 February 2026\nClassification: Public submission — subject to LGOIMA review for personal details" }] },
  ];

  // Content for doc-006 (internal memo)
  const doc006: InputJsonValue = [
    { heading: "Internal Memorandum", segments: [{ text: "CONFIDENTIAL MEMORANDUM\nTo: Infrastructure Committee\nFrom: Finance Manager — Infrastructure\nDate: 10 March 2026\nRe: Coastal Walkway Stage 2 — Budget Overrun" }] },
    { heading: "Purpose", segments: [{ text: "This memo alerts the committee to a projected cost overrun on the Coastal Walkway Stage 2 project." }] },
    { heading: "Budget Status", segments: [
      { text: "The approved Stage 2 budget was $4.8M. Following the completion of detailed design and receipt of geotechnical findings, the project team now estimates the actual cost at " },
      { text: "$5.6M — a $800,000 (17%) overrun", detectionId: "det-040" },
      { text: ".\n\nThe main cost increases are:\n• Additional ground reinforcement (cliff erosion risk): $450,000\n• Extended land acquisition (Route C option): $220,000\n• Resource consent conditions (ecology): $130,000" },
    ] },
    { heading: "Staff Recommendation", segments: [
      { text: "The Finance Manager recommends re-prioritising other capital projects to fund the overrun. " },
      { text: "Specifically, deferring the Mangati Stream culvert renewal ($820,000) would cover the Coastal Walkway overrun and avoid public controversy about scaling back the walkway project mid-construction.", detectionId: "det-041" },
    ] },
    { heading: "Political Considerations", segments: [
      { text: "The Mayor has publicly committed to completing the walkway before the October 2026 election. " },
      { text: "If we report the overrun to the full council, it will almost certainly leak to the media. The opposition councillors will use this to attack the Mayor's project management record.", detectionId: "det-042" },
      { text: " Staff recommend briefing the Mayor privately before any public announcement." },
    ] },
    { segments: [{ text: "\n---\nClassification: CONFIDENTIAL\nLGOIMA: s7(2)(f)(i) — free and frank opinions" }] },
  ];

  // Content for doc-007 (contractor quote)
  const doc007: InputJsonValue = [
    { heading: "Contractor Quotation", segments: [{ text: "MAINWORKS LTD\nQuotation for Coastal Walkway Stage 2 — Main Earthworks Package\nQuote No: MW-2025-1847\nDate: 18 November 2025" }] },
    { heading: "Project Scope", segments: [{ text: "Supply and install all earthworks, retaining structures, and subgrade preparation for the Coastal Walkway Extension Stage 2, chainage 0-2800m, in accordance with council specification INFRA-CW-2025." }] },
    { heading: "Pricing", segments: [
      { text: "Base contract price: " },
      { text: "$890,000 (excl GST)", detectionId: "det-043" },
      { text: "\nProvisional sums:\n• Rock anchoring (if required): $120,000\n• Additional compaction (soft ground): $45,000\n\nTotal maximum price: $1,055,000 (excl GST)" },
    ] },
    { heading: "Programme", segments: [{ text: "Commencement: 15 April 2026\nCompletion: 30 September 2026\nLiquidated damages: $2,500 per day" }] },
    { heading: "Key Personnel", segments: [
      { text: "Project Manager: " },
      { text: "Tony Richardson", detectionId: "det-044" },
      { text: " (mobile: " },
      { text: "021 445 9923", detectionId: "det-045" },
      { text: ")\nSite Supervisor: " },
      { text: "Melissa Grant", detectionId: "det-046" },
      { text: "\n\nMainWorks Ltd holds all required site safety certifications and $10M public liability insurance." },
    ] },
    { heading: "Conditions", segments: [{ text: "This quote is valid for 90 days from the date of issue. Acceptance of this quote constitutes a binding contract subject to NZS 3910:2013 conditions.\n\nPayment terms: Monthly progress claims within 5 working days of claim submission." }] },
    { segments: [{ text: "\n---\nSigned: M. Peterson, Contracts Manager\nMainWorks Ltd\nDate: 18 November 2025" }] },
  ];

  // Content for doc-017 (council deliberation minutes)
  const doc017: InputJsonValue = [
    { heading: "Council Meeting Minutes (Public Excluded)", segments: [{ text: "DISTRICT COUNCIL\nExtraordinary Meeting — Public Excluded Session\nDate: 12 March 2026\nRe: Sale of Council Property — 45 Devon Street East" }] },
    { heading: "Present", segments: [{ text: "Mayor J. Holdom (Chair), Deputy Mayor R. Nixon, Councillors: Bridges, Davidson, Henderson, Patel, Thompson, Winters, Mitchell\n\nIn Attendance: Chief Executive, Group Manager Property, Legal Advisor" }] },
    { heading: "Resolution to Exclude Public", segments: [{ text: "Moved: Cr. Henderson | Seconded: Cr. Patel\nThat the public be excluded from the following parts of the proceedings of this meeting on the grounds that the information to be considered is commercially sensitive under s7(2)(b)(ii) of the Local Government Official Information and Meetings Act 1987.\nCarried unanimously" }] },
    { heading: "Item 1: Sale of 45 Devon Street East", segments: [
      { text: "The Property Manager presented the valuation report and outlined three offers received:\n• " },
      { text: "Offer A: $3.8M conditional", detectionId: "det-204" },
      { text: "\n• " },
      { text: "Offer B: $4.1M unconditional (Maxwell Development Group)", detectionId: "det-205" },
      { text: "\n• " },
      { text: "Offer C: $3.95M conditional with leaseback", detectionId: "det-206" },
    ] },
    { heading: "Discussion", segments: [
      { text: "Cr. Henderson questioned whether the council should accept " },
      { text: "Offer B given it's from Gregory Maxwell, who is a donor to the Mayor's election campaign", detectionId: "det-207" },
      { text: ". The Mayor declared a potential conflict of interest but noted the campaign donation was disclosed and within legal limits.\n\n" },
      { text: "Cr. Bridges stated: \"I'm uncomfortable proceeding with this sale before the community has had a chance to provide input. This is a significant asset disposal and the public excluded process feels like we're hiding something.\"", detectionId: "det-208" },
      { text: "\n\nThe CEO advised that public consultation was not legally required as the property is below the significance threshold in the Significance and Engagement Policy ($5M), but acknowledged the political sensitivities." },
    ] },
    { heading: "Resolution", segments: [{ text: "Moved: Cr. Patel | Seconded: Cr. Mitchell\nThat the council:\n(a) Accepts Offer B from Maxwell Development Group Ltd for the purchase of 45 Devon Street East for $4.1M (unconditional)\n(b) Delegates authority to the CEO to execute the sale and purchase agreement\n(c) Notes that the Mayor has declared a potential conflict of interest\n\nFor: Mayor Holdom, Crs Nixon, Patel, Mitchell, Winters, Thompson (6)\nAgainst: Crs Henderson, Bridges, Davidson (3)\nCarried" }] },
    { segments: [{ text: "\nMeeting closed at 4:45pm\n\n---\nMinutes: Public Excluded\nClassification: Confidential — Commercial sensitivity\nLGOIMA: s7(2)(b)(ii), s7(2)(f)(i)" }] },
  ];

  // Content for doc-018 (offer letter)
  const doc018: InputJsonValue = [
    { heading: "Offer to Purchase", segments: [{ text: "MAXWELL DEVELOPMENT GROUP LTD\nOffer to Purchase Council Property\nDate: 20 January 2026" }] },
    { heading: "Property", segments: [{ text: "45 Devon Street East, Taranaki District\nLegal description: Lot 3 DP 12847\nArea: 2,840m²" }] },
    { heading: "Offer", segments: [
      { text: "Maxwell Development Group Ltd offers to purchase the above property for " },
      { text: "$4,100,000 (Four million one hundred thousand dollars) plus GST (if any)", detectionId: "det-209" },
      { text: ".\n\nThis offer is unconditional and not subject to finance, due diligence, or consents." },
    ] },
    { heading: "Settlement", segments: [{ text: "Settlement date: 90 days from acceptance\nDeposit: $410,000 (10%) payable on acceptance\nBalance: Payable on settlement" }] },
    { heading: "Special Conditions", segments: [
      { text: "1. The purchaser intends to demolish the existing building and develop a " },
      { text: "six-storey mixed-use development with ground floor retail and 42 residential apartments", detectionId: "det-210" },
      { text: ".\n\n2. The purchaser requests that the council provide written confirmation of the property's Mixed Use zoning and maximum permitted building height (22m) under the operative District Plan.\n\n3. " },
      { text: "The purchaser has secured pre-approval for development finance from ANZ Bank totalling $18.5M", detectionId: "det-211" },
      { text: "." },
    ] },
    { heading: "Contact", segments: [
      { text: "This offer is made by " },
      { text: "Gregory Maxwell", detectionId: "det-212" },
      { text: ", Director\nMaxwell Development Group Ltd\nEmail: " },
      { text: "g.maxwell@maxwelldev.co.nz", detectionId: "det-213" },
      { text: "\nPhone: " },
      { text: "027 334 5512", detectionId: "det-214" },
    ] },
    { segments: [{ text: "\n\n---\nSigned: Gregory Maxwell, Director\nDate: 20 January 2026\n\nOffer accepted by District Council: 12 March 2026" }] },
  ];

  // Content for doc-019 (email thread)
  const doc019: InputJsonValue = [
    { heading: "Email Thread", segments: [{ text: "Subject: RE: Devon Street Property Sale — Confidential\nDate: 8 February 2026" }] },
    { heading: "Message 1 of 2", segments: [
      { text: "From: Property Manager <prop.manager@local.govt.nz>\nTo: CEO\nDate: 8 February 2026 14:30\n\nCEO,\n\nJust a heads up — " },
      { text: "Gregory Maxwell has indicated he's prepared to increase his offer to $4.2M if we can settle by end of March rather than the standard 90-day period", detectionId: "det-215" },
      { text: ". His lawyer says they have pre-purchased development finance in place and want to get started ASAP.\n\n" },
      { text: "I'm aware of the political optics given Maxwell's previous donations to the Mayor's campaign", detectionId: "det-216" },
      { text: ", but from a pure commercial perspective this is the strongest offer we're likely to get.\n\nYour thoughts?" },
    ] },
    { heading: "Message 2 of 2", segments: [
      { text: "From: CEO\nTo: Property Manager\nDate: 8 February 2026 16:15\n\n" },
      { text: "Let's stick with the standard settlement timeframe. Accelerating this for an extra $100K would look terrible if it leaked to the media", detectionId: "det-217" },
      { text: ". The opposition councillors are already suspicious about this sale.\n\nPresent the three offers to the council without mentioning Maxwell's conditional higher offer. We'll let the elected members make the decision on commercial grounds." },
    ] },
    { segments: [{ text: "\n---\nClassification: Confidential\nNot for release" }] },
  ];

  // Content for doc-021 (insurance claim)
  const doc021: InputJsonValue = [
    { heading: "Insurance Claim Summary", segments: [{ text: "FEBRUARY 2026 FLOODING EVENT\nInsurance Claim Register\nPrepared: 5 March 2026" }] },
    { heading: "Overview", segments: [{ text: "Following the extreme rainfall event of 14-15 February 2026, the council has lodged multiple insurance claims with NZI (Vero) for infrastructure damage across the district." }] },
    { heading: "Claims Summary", segments: [
      { text: "Claim 1 — Northern Trunk Main (Stormwater)\n" },
      { text: "Claim amount: $1,450,000", detectionId: "det-218" },
      { text: "\nStatus: Under assessment\n" },
      { text: "Insurer concern: $380,000 of the claim relates to pipe sections that show evidence of pre-existing deterioration. The insurer has indicated this portion may not be covered under the policy.", detectionId: "det-219" },
      { text: "\n\nClaim 2 — Pump Station #3\nClaim amount: $245,000\nStatus: Approved\nSettlement: Paid 1 March 2026\n\nClaim 3 — Creek Road Retaining Wall\nClaim amount: $520,000\nStatus: Under assessment\nInsurer concern: Engineering assessment required to determine if wall failure was due to flood event or inadequate original design.\n\nClaim 4 — Bridge Street Culvert\n" },
      { text: "Claim amount: $180,000", detectionId: "det-220" },
      { text: "\nStatus: Approved pending engineer's certificate" },
    ] },
    { heading: "Legal Advice", segments: [
      { text: "The council's insurance broker (Marsh Ltd) has recommended engaging " },
      { text: "legal counsel to dispute the insurer's position on Claim 1", detectionId: "det-221" },
      { text: ". The broker's view is that pre-existing pipe condition is not relevant if the flood event caused the actual failure.\n\n" },
      { text: "External legal advice from Chapman Tripp (4 March 2026) supports the broker's position and estimates a 70% likelihood of recovering the full $1.45M if the matter proceeds to dispute resolution.", detectionId: "det-222" },
    ] },
    { heading: "Financial Impact", segments: [
      { text: "Total claims: $2,395,000\nApproved to date: $245,000\nIn dispute: $1,450,000\nUnder assessment: $700,000\n\n" },
      { text: "If the insurer reduces Claim 1 by $380,000, the council will need to fund this from the emergency works budget or seek a budget variation.", detectionId: "det-223" },
    ] },
    { segments: [{ text: "\n---\nPrepared by: Finance — Insurance\nClassification: Confidential — Legal privilege" }] },
  ];

  // Content for doc-022 (email with insurer)
  const doc022: InputJsonValue = [
    { heading: "Outlook Email Thread", segments: [{ text: "Subject: Claim #NZI-2026-FL-003847 — Northern Trunk Main\nDate: 28 February 2026\nThread: 4 messages" }] },
    { heading: "Message 1", segments: [
      { text: "From: Claims Assessor (NZI) <claims@nzi.co.nz>\nTo: Council Insurance Team\nDate: 28 February 2026 10:15\n\nGood morning,\n\nWe have completed our initial assessment of your claim for the Northern Trunk Main damage. Our engineer's report indicates that " },
      { text: "approximately 30% of the damaged pipe sections show signs of corrosion and deterioration consistent with age-related degradation rather than acute flood damage", detectionId: "det-224" },
      { text: ".\n\nUnder the policy terms, we are liable for sudden and unforeseen damage, not for gradual deterioration. " },
      { text: "We propose to settle the claim at $1,070,000 (full claim less the $380,000 attributable to pre-existing condition)", detectionId: "det-225" },
      { text: ".\n\nPlease review and advise if you accept this settlement." },
    ] },
    { heading: "Message 2", segments: [
      { text: "From: Council Insurance Team\nTo: Claims Assessor (NZI)\nDate: 28 February 2026 14:30\n\nThank you for your assessment. " },
      { text: "The council disputes your engineer's findings. Our own engineering consultant (GHD Ltd) has assessed the failure and attributes it entirely to the extreme hydraulic loads during the 14-15 February event", detectionId: "det-226" },
      { text: ".\n\n" },
      { text: "While we acknowledge some sections showed age-related wear, this is normal for a 40-year-old pipeline and does not constitute \"gradual deterioration\" within the meaning of the policy exclusion", detectionId: "det-227" },
      { text: ".\n\nWe require payment of the full $1,450,000 claim and reserve our right to escalate this to dispute resolution if necessary." },
    ] },
    { heading: "Message 3", segments: [
      { text: "From: Claims Assessor (NZI)\nTo: Council Insurance Team\nDate: 1 March 2026 09:00\n\nWe maintain our position. " },
      { text: "Our policy does not cover \"repair or replacement made necessary by wear, tear, gradual deterioration, rust, corrosion\" (see Policy Schedule, Section 3.2.4)", detectionId: "det-228" },
      { text: ".\n\nIf you wish to dispute this, please follow the dispute resolution process outlined in Section 12 of your policy.\n\nOur settlement offer of $1,070,000 remains open for 14 days." },
    ] },
    { heading: "Message 4", segments: [
      { text: "From: Council Insurance Team\nTo: Claims Assessor (NZI)\nDate: 2 March 2026 11:30\n\n" },
      { text: "We formally reject your settlement offer and invoke the dispute resolution process under Section 12. We have instructed Chapman Tripp to act on the council's behalf", detectionId: "det-229" },
      { text: ".\n\nWe will be seeking full recovery of the $1,450,000 claim plus the council's legal costs." },
    ] },
    { segments: [{ text: "\n--- End of thread ---" }] },
  ];

  // Content for doc-023 (repair costs)
  const doc023: InputJsonValue = [
    { heading: "Repair Cost Estimate", segments: [{ text: "INFRASTRUCTURE REPAIR COSTS\nFebruary 2026 Flooding Event — Northern Suburbs\nDate: 25 February 2026" }] },
    { heading: "Emergency Works (Completed)", segments: [
      { text: "Immediate emergency stabilisation and temporary repairs have been completed at a cost of " },
      { text: "$215,000", detectionId: "det-230" },
      { text: " (funded from Emergency Works budget).\n\nWorks included:\n• Temporary bypass pumping — Northern Trunk Main\n• Emergency road repairs (Creek Road)\n• Safety fencing and signage" },
    ] },
    { heading: "Permanent Repair Costs", segments: [
      { text: "1. Northern Trunk Main Replacement\n" },
      { text: "Cost: $1,320,000", detectionId: "det-231" },
      { text: "\nScope: Replace 450m of 900mm diameter RCP with HDPE pipe (chainage 1,400-1,850m)\nContractor: " },
      { text: "Downer NZ Ltd — quoted $1.32M + contingency", detectionId: "det-232" },
      { text: "\nProgramme: 8 weeks (subject to road closure approvals)\n\n2. Creek Road Retaining Wall\nCost: $485,000\nScope: Reconstruct 50m section with deeper foundations\nContractor: MainWorks Ltd\nProgramme: 6 weeks\n\n3. Pump Station #3 Electrical Repairs\nCost: $238,000\nScope: Replace switchboards, control panels, VFDs\nContractor: " },
      { text: "ElectroServ Ltd", detectionId: "det-233" },
      { text: "\nProgramme: 4 weeks\n\n4. Bridge Street Culvert\nCost: $165,000\nScope: Replace headwall and wing walls\nContractor: MainWorks Ltd\nProgramme: 3 weeks" },
    ] },
    { heading: "Total Costs", segments: [{ text: "Emergency works (completed): $215,000\nPermanent repairs (estimated): $2,208,000\nContingency (10%): $221,000\n\nGrand Total: $2,644,000\n\nFunding:\n• Insurance (approved/pending): $1,895,000\n• Insurance (in dispute): $380,000\n• Council emergency budget: $369,000\n• Budget shortfall: $0 (if insurance claim succeeds)" }] },
    { heading: "Programme", segments: [{ text: "All permanent repairs scheduled for completion by 30 June 2026 to avoid winter construction delays." }] },
    { segments: [{ text: "\n---\nPrepared by: Infrastructure — Asset Management\nApproved by: Group Manager Infrastructure" }] },
  ];

  // Update documents with content
  const contentMap: Record<string, InputJsonValue> = {
    "doc-004": doc004,
    "doc-006": doc006,
    "doc-007": doc007,
    "doc-017": doc017,
    "doc-018": doc018,
    "doc-019": doc019,
    "doc-021": doc021,
    "doc-022": doc022,
    "doc-023": doc023,
  };

  console.log("Updating documents with content...");
  let updated = 0;
  for (const [docId, content] of Object.entries(contentMap)) {
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true, contentJson: true },
    });

    if (!doc) {
      console.log(`  ⚠ Document ${docId} not found, skipping`);
      continue;
    }

    if (doc.contentJson) {
      console.log(`  ⚠ Document ${docId} already has content, skipping`);
      continue;
    }

    await prisma.document.update({
      where: { id: docId },
      data: { contentJson: content },
    });
    console.log(`  ✓ ${docId}: content added`);
    updated++;
  }

  console.log(`\nContent seeding complete!`);
  console.log(`  ${newDetections.length} detections added`);
  console.log(`  ${updated} documents populated with content`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Content seeding failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
