/**
 * Additive seed script — populates documents, detections, and content
 * across cases that currently have no documents, making the UI look
 * fully populated for screenshots.
 *
 * Run with:
 *   DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx tsx prisma/seed-extra-docs.ts
 */

import { PrismaClient } from "../lib/generated/prisma/client";
import type { Prisma } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type InputJsonValue = Prisma.InputJsonValue;

const connectionString =
  process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5434/veil";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/* ------------------------------------------------------------------ */
/*  Helper: upsert array                                               */
/* ------------------------------------------------------------------ */
async function upsertDocs(docs: Array<Record<string, unknown>>) {
  for (const d of docs) {
    await prisma.document.upsert({
      where: { id: d.id as string },
      update: d as Prisma.DocumentUpdateInput,
      create: d as Prisma.DocumentUncheckedCreateInput,
    });
  }
}

async function upsertDetections(dets: Array<Record<string, unknown>>) {
  for (const d of dets) {
    await prisma.detection.upsert({
      where: { id: d.id as string },
      update: d as Prisma.DetectionUpdateInput,
      create: d as Prisma.DetectionUncheckedCreateInput,
    });
  }
}

/* ================================================================== */
/*  MAIN                                                               */
/* ================================================================== */
async function main() {
  console.log("Seeding extra documents...\n");

  // ============================================================
  // req-003: Community grants (status: ingesting, 213 docs claimed)
  // Add a few docs that are "pending" (just ingested)
  // ============================================================
  const req003Docs = [
    { id: "doc-030", caseId: "req-003", name: "Grant_Application_Youth_Sports_Trust.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 2800 * 1024, pageCount: 12, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-031", caseId: "req-003", name: "Assessment_Panel_Notes_Round1.docx", fileType: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 450 * 1024, pageCount: 8, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-032", caseId: "req-003", name: "Grant_Application_Marae_Renovation.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3100 * 1024, pageCount: 15, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-033", caseId: "req-003", name: "Funding_Criteria_2025-26.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 890 * 1024, pageCount: 6, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-034", caseId: "req-003", name: "Email_Thread_Assessment_Panel_Conflicts.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 220 * 1024, pageCount: 4, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
  ];
  await upsertDocs(req003Docs);
  console.log(`  ✓ req-003: ${req003Docs.length} documents (ingesting)`);

  // ============================================================
  // req-004: Resource consents (status: released, 156 docs)
  // Add docs in "approved" status + some content & detections
  // ============================================================
  const req004Docs = [
    { id: "doc-040", caseId: "req-004", name: "Resource_Consent_RC-2024-1203.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 5400 * 1024, pageCount: 32, status: "approved", detectionCount: 28, avgConfidence: 83, assigneeId: "u-003" },
    { id: "doc-041", caseId: "req-004", name: "Air_Discharge_Monitoring_Q4_2025.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 1800 * 1024, pageCount: 14, status: "approved", detectionCount: 12, avgConfidence: 79, assigneeId: "u-008" },
    { id: "doc-042", caseId: "req-004", name: "Compliance_Inspection_Report_Nov2025.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 2200 * 1024, pageCount: 18, status: "approved", detectionCount: 15, avgConfidence: 86, assigneeId: "u-004" },
    { id: "doc-043", caseId: "req-004", name: "Email_Compliance_Officer_to_Applicant.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 340 * 1024, pageCount: 5, status: "approved", detectionCount: 19, avgConfidence: 77, assigneeId: "u-003" },
    { id: "doc-044", caseId: "req-004", name: "Noise_Assessment_Eastern_Industrial.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 4100 * 1024, pageCount: 24, status: "approved", detectionCount: 8, avgConfidence: 91, assigneeId: "u-008" },
    { id: "doc-045", caseId: "req-004", name: "Iwi_Cultural_Impact_Assessment.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3600 * 1024, pageCount: 22, status: "approved", detectionCount: 16, avgConfidence: 82, assigneeId: "u-004" },
  ];
  await upsertDocs(req004Docs);

  // Detections for doc-043 (email thread)
  const req004Dets = [
    { id: "det-100", documentId: "doc-043", type: "personal-name", text: "Peter Brandt", confidence: 94, page: 1, posX: 150, posY: 80, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Name of the applicant — a private business owner, not a public official.", piConsideration: "No overriding public interest in disclosing the applicant's name in this context.", aiExplanation: "Personal name identified as the consent applicant. The individual is a private business operator, not acting in an official public capacity.", source: "ai" },
    { id: "det-101", documentId: "doc-043", type: "email-addr", text: "p.brandt@eastindustrial.co.nz", confidence: 97, page: 1, posX: 150, posY: 105, posW: 280, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Business email address linked to the applicant.", piConsideration: "Email belongs to a private business entity.", aiExplanation: "Email address with a business domain linked to the consent applicant.", source: "ai" },
    { id: "det-102", documentId: "doc-043", type: "phone", text: "027 445 6612", confidence: 98, page: 1, posX: 150, posY: 130, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Personal mobile number of the consent applicant.", piConsideration: "No public interest in disclosing private contact details.", aiExplanation: "NZ mobile phone number (027 prefix) associated with the consent applicant.", source: "ai" },
    { id: "det-103", documentId: "doc-043", type: "free-frank", text: "Between you and me, I think this application should have been declined at the outset. The discharge levels exceed the permitted baseline and the effects assessment is inadequate. But the applicant has political connections and management want it processed quickly.", confidence: 82, page: 3, posX: 80, posY: 200, posW: 520, posH: 66, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "Candid internal opinion from a compliance officer about political influence on the consent process.", piConsideration: "Strong public interest in the disclosure of political interference, but staff must be able to express frank opinions internally. On balance, withhold the staff member's opinion but consider releasing the factual basis.", aiExplanation: "Internal staff correspondence expressing frank criticism of the consent process, referencing political influence. This is clearly a free and frank opinion provided in confidence.", source: "ai" },
    { id: "det-104", documentId: "doc-043", type: "commercial", text: "The applicant's annual production volume is approximately 45,000 tonnes, generating $12.8M revenue", confidence: 76, page: 2, posX: 80, posY: 300, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Specific commercial production and revenue data of a private business.", piConsideration: "Disclosure would reveal commercially sensitive business metrics to competitors.", aiExplanation: "Specific production volumes and revenue figures for a private business, submitted as part of a resource consent application. This constitutes trade information.", source: "ai" },
  ];
  await upsertDetections(req004Dets);

  // Content for doc-043
  const doc043Content: InputJsonValue = [
    { heading: "Internal Correspondence", segments: [{ text: "Subject: RE: Resource Consent RC-2024-1203 — Compliance Status\nDate: 18 November 2025\nThread: 3 messages" }] },
    { heading: "Message 1 of 3", segments: [
      { text: "From: L. Ngata <l.ngata@local.govt.nz>\nTo: Environmental Compliance Team\nDate: 18 November 2025 14:22\n\nTeam,\n\nFollowing the site inspection last week, I need to flag several compliance concerns with the " },
      { text: "Peter Brandt", detectionId: "det-100" },
      { text: " (" },
      { text: "p.brandt@eastindustrial.co.nz", detectionId: "det-101" },
      { text: ", mobile: " },
      { text: "027 445 6612", detectionId: "det-102" },
      { text: ") operation at the eastern industrial area.\n\nThe consent conditions require quarterly air discharge monitoring and the Q3 2025 results show exceedances on two parameters." },
    ] },
    { heading: "Message 2 of 3", segments: [
      { text: "From: S. Thompson <s.thompson@local.govt.nz>\nTo: L. Ngata\nDate: 18 November 2025 15:10\n\nThanks Lisa. I've reviewed the monitoring data. " },
      { text: "The applicant's annual production volume is approximately 45,000 tonnes, generating $12.8M revenue", detectionId: "det-104" },
      { text: " — so they're a significant local employer. That said, consent conditions are consent conditions.\n\nI've drafted an abatement notice but want your view before I send it." },
    ] },
    { heading: "Message 3 of 3", segments: [
      { text: "From: L. Ngata\nTo: S. Thompson\nDate: 18 November 2025 16:45\n\n" },
      { text: "Between you and me, I think this application should have been declined at the outset. The discharge levels exceed the permitted baseline and the effects assessment is inadequate. But the applicant has political connections and management want it processed quickly.", detectionId: "det-103" },
      { text: "\n\nLet's proceed with the abatement notice. We need to document this properly regardless of the politics." },
    ] },
    { segments: [{ text: "\n--- End of thread ---\nClassification: In-Confidence" }] },
  ];
  await prisma.document.update({ where: { id: "doc-043" }, data: { contentJson: doc043Content } });
  console.log(`  ✓ req-004: ${req004Docs.length} documents + ${req004Dets.length} detections`);

  // ============================================================
  // req-005: Three Waters reform (status: final-approval, 78 docs)
  // ============================================================
  const req005Docs = [
    { id: "doc-050", caseId: "req-005", name: "Three_Waters_Transition_Briefing_Paper.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3800 * 1024, pageCount: 22, status: "approved", detectionCount: 32, avgConfidence: 81, assigneeId: "u-003" },
    { id: "doc-051", caseId: "req-005", name: "Water_Services_Entity_Impact_Assessment.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 6200 * 1024, pageCount: 38, status: "approved", detectionCount: 24, avgConfidence: 85, assigneeId: "u-004" },
    { id: "doc-052", caseId: "req-005", name: "Email_Mayor_to_Minister_Feb2026.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 280 * 1024, pageCount: 4, status: "approved", detectionCount: 18, avgConfidence: 78, assigneeId: "u-003" },
    { id: "doc-053", caseId: "req-005", name: "Council_Workshop_Notes_Confidential.docx", fileType: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 520 * 1024, pageCount: 10, status: "approved", detectionCount: 41, avgConfidence: 74, assigneeId: "u-005" },
    { id: "doc-054", caseId: "req-005", name: "Staff_Transition_Plan_Draft.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 1900 * 1024, pageCount: 16, status: "approved", detectionCount: 22, avgConfidence: 88, assigneeId: "u-004" },
    { id: "doc-055", caseId: "req-005", name: "Financial_Impact_Model_v2.xlsx", fileType: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 1200 * 1024, pageCount: 8, status: "submitted", detectionCount: 15, avgConfidence: 82, assigneeId: "u-003" },
  ];
  await upsertDocs(req005Docs);

  const req005Dets = [
    { id: "det-110", documentId: "doc-053", type: "free-frank", text: "Several councillors expressed concern that the transition would result in a loss of local control over water infrastructure. Cr. Henderson stated: 'This is a fundamental erosion of local democracy and I will oppose it publicly if needed.'", confidence: 86, page: 2, posX: 80, posY: 180, posW: 520, posH: 66, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "Free and frank opinions expressed in a confidential council workshop. Councillors have an expectation that workshop discussions are confidential.", piConsideration: "Public interest in elected officials' views on significant reform, but workshop format creates expectation of confidence for deliberation.", aiExplanation: "Confidential workshop notes recording councillors' frank opinions about central government reform. The context suggests these were deliberative discussions not intended for public attribution.", source: "ai" },
    { id: "det-111", documentId: "doc-053", type: "free-frank", text: "The CEO advised that the council should consider 'strategic non-compliance' with certain transition deadlines to preserve negotiating leverage with the new water entity.", confidence: 79, page: 4, posX: 80, posY: 250, posW: 520, posH: 44, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "CEO's frank strategic advice to councillors on negotiation tactics.", piConsideration: "High public interest in the CEO's approach to compliance with central government requirements, but free and frank advice to elected members during deliberation should be protected.", aiExplanation: "Internal strategic advice from the CEO suggesting a non-standard approach to compliance timelines. This is clearly a frank opinion on negotiation strategy provided in a confidential setting.", source: "ai" },
    { id: "det-112", documentId: "doc-053", type: "personal-name", text: "Margaret Winters", confidence: 93, page: 3, posX: 200, posY: 340, posW: 170, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Name of an external consultant engaged to advise on the transition.", piConsideration: "Consultant acting in a professional capacity — name may be releasable but personal details should be protected.", aiExplanation: "Name of a consultant from Deloitte engaged by the council for Three Waters transition advice.", source: "ai" },
    { id: "det-113", documentId: "doc-053", type: "commercial", text: "Deloitte's engagement fee for the transition advisory was $185,000, with an additional $45,000 approved for Phase 2 analysis", confidence: 74, page: 5, posX: 80, posY: 150, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "rejected", reasoning: "", piConsideration: "", aiExplanation: "Professional fees paid by council to an advisory firm. Public interest likely outweighs withholding as this is expenditure of public funds. Councils typically disclose consulting fees.", source: "ai", reviewedBy: "u-005", reviewedAt: new Date("2026-03-22T14:30:00") },
    { id: "det-114", documentId: "doc-054", type: "personal-name", text: "Sarah Jennings", confidence: 91, page: 2, posX: 180, posY: 200, posW: 150, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Name of a council water services staff member whose position may be affected by the transition.", piConsideration: "Staff member's employment situation is a private matter.", aiExplanation: "Name of a council employee discussed in the context of potential redundancy or transfer as part of the Three Waters transition.", source: "ai" },
    { id: "det-115", documentId: "doc-054", type: "personal-name", text: "David Kowalski", confidence: 89, page: 4, posX: 180, posY: 280, posW: 160, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Name of a council water services team leader whose role is affected.", piConsideration: "Individual's employment status is private.", aiExplanation: "Name of a team leader in water services discussed in context of position restructuring.", source: "ai" },
  ];
  await upsertDetections(req005Dets);

  // Content for doc-053
  const doc053Content: InputJsonValue = [
    { heading: "Council Workshop Notes", segments: [{ text: "THREE WATERS REFORM — CONFIDENTIAL WORKSHOP\nDate: 8 February 2026 | Venue: Council Chamber (Closed Session)\nAttendees: Mayor, all Councillors, CEO, GM Infrastructure, GM Finance" }] },
    { heading: "1. Purpose", segments: [{ text: "This workshop was held to brief elected members on the current status of the Three Waters reform transition and to seek direction on the council's strategic approach to the transition timeline." }] },
    { heading: "2. Background", segments: [{ text: "The Government's revised Three Waters programme requires all territorial authorities to transition water services delivery to the new regional water services entity by 1 July 2027. The council currently operates water supply, wastewater, and stormwater networks serving approximately 80,000 residents across the district." }] },
    { heading: "3. Councillor Feedback", segments: [
      { text: "Several councillors expressed concern that the transition would result in a loss of local control over water infrastructure. Cr. Henderson stated: 'This is a fundamental erosion of local democracy and I will oppose it publicly if needed.'", detectionId: "det-110" },
      { text: "\n\nCr. Patel noted the financial implications — the council has $180M in water-related debt that would transfer to the new entity, potentially affecting the council's credit rating during the transition period." },
    ] },
    { heading: "4. CEO Advice", segments: [
      { text: "The CEO advised that the council should consider 'strategic non-compliance' with certain transition deadlines to preserve negotiating leverage with the new water entity.", detectionId: "det-111" },
      { text: "\n\nThis approach has been adopted informally by at least three other councils in the region, though none have publicly acknowledged it." },
    ] },
    { heading: "5. External Advice", segments: [
      { text: "The transition advisory team led by " },
      { text: "Margaret Winters", detectionId: "det-112" },
      { text: " (Deloitte) presented three scenarios for the council's transition approach. " },
      { text: "Deloitte's engagement fee for the transition advisory was $185,000, with an additional $45,000 approved for Phase 2 analysis", detectionId: "det-113" },
      { text: ". The advisory team recommended Scenario 2 (negotiated transition) as the preferred approach." },
    ] },
    { heading: "6. Resolution", segments: [{ text: "The workshop resolved (informally) to:\n(a) Continue engaging with the transition entity while reserving the council's position;\n(b) Seek legal advice on the council's obligations regarding asset transfer timelines;\n(c) Prepare a public communication strategy for affected ratepayers;\n(d) Commission an independent valuation of all water assets before any transfer." }] },
    { segments: [{ text: "\nNotes prepared by: Office of the CEO\nClassification: CONFIDENTIAL — Not for public release\nLGOIMA: Subject to s7(2)(f)(i) — free and frank expression of opinions" }] },
  ];
  await prisma.document.update({ where: { id: "doc-053" }, data: { contentJson: doc053Content } });
  console.log(`  ✓ req-005: ${req005Docs.length} documents + ${req005Dets.length} detections`);

  // ============================================================
  // req-009: Town Centre Revitalisation (status: ingesting, 512 docs)
  // ============================================================
  const req009Docs = [
    { id: "doc-060", caseId: "req-009", name: "Town_Centre_Master_Plan_Draft.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 15200 * 1024, pageCount: 68, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-061", caseId: "req-009", name: "Public_Consultation_Summary_Phase1.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 4500 * 1024, pageCount: 28, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-062", caseId: "req-009", name: "Traffic_Impact_Assessment.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 8900 * 1024, pageCount: 42, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-063", caseId: "req-009", name: "Heritage_Assessment_CBD_Buildings.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 6700 * 1024, pageCount: 34, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-064", caseId: "req-009", name: "Landscape_Architecture_Concept.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 22000 * 1024, pageCount: 18, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-065", caseId: "req-009", name: "Community_Board_Minutes_Jan2026.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 780 * 1024, pageCount: 8, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-066", caseId: "req-009", name: "Property_Developer_Correspondence.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 420 * 1024, pageCount: 6, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-067", caseId: "req-009", name: "Cost_Benefit_Analysis_v3.xlsx", fileType: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 1800 * 1024, pageCount: 12, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
  ];
  await upsertDocs(req009Docs);
  console.log(`  ✓ req-009: ${req009Docs.length} documents (ingesting)`);

  // ============================================================
  // req-011: Multicultural Advisory (status: in-review, 34 docs)
  // ============================================================
  const req011Docs = [
    { id: "doc-070", caseId: "req-011", name: "MAC_Meeting_Minutes_15Jan2025.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 680 * 1024, pageCount: 6, status: "approved", detectionCount: 8, avgConfidence: 84, assigneeId: "u-007" },
    { id: "doc-071", caseId: "req-011", name: "MAC_Meeting_Minutes_19Feb2025.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 720 * 1024, pageCount: 7, status: "approved", detectionCount: 6, avgConfidence: 81, assigneeId: "u-007" },
    { id: "doc-072", caseId: "req-011", name: "MAC_Meeting_Minutes_19Mar2025.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 590 * 1024, pageCount: 5, status: "in-review", detectionCount: 10, avgConfidence: 79, assigneeId: "u-007" },
    { id: "doc-073", caseId: "req-011", name: "Cultural_Competency_Training_Report.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 2100 * 1024, pageCount: 18, status: "in-review", detectionCount: 14, avgConfidence: 76, assigneeId: "u-007" },
    { id: "doc-074", caseId: "req-011", name: "Diversity_Strategy_2025-2028.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3400 * 1024, pageCount: 22, status: "in-review", detectionCount: 5, avgConfidence: 88, assigneeId: "u-007" },
    { id: "doc-075", caseId: "req-011", name: "Community_Event_Funding_Requests.xlsx", fileType: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 450 * 1024, pageCount: 4, status: "approved", detectionCount: 12, avgConfidence: 82, assigneeId: "u-007" },
  ];
  await upsertDocs(req011Docs);

  const req011Dets = [
    { id: "det-120", documentId: "doc-072", type: "personal-name", text: "Amara Osei", confidence: 94, page: 2, posX: 150, posY: 200, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of a community member who raised concerns about discrimination in a public submission to the committee.", source: "ai" },
    { id: "det-121", documentId: "doc-072", type: "personal-name", text: "Wei Lin Chen", confidence: 92, page: 3, posX: 150, posY: 300, posW: 150, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of a committee member who is a community volunteer, not a council official.", source: "ai" },
    { id: "det-122", documentId: "doc-072", type: "phone", text: "022 198 3347", confidence: 97, page: 3, posX: 150, posY: 325, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Personal mobile number of a committee member who is a community volunteer.", source: "ai" },
    { id: "det-123", documentId: "doc-073", type: "free-frank", text: "Several staff members reported feeling underprepared for cross-cultural engagement. One team leader noted: 'We've had no formal training since 2019, and the district's demographics have changed significantly since then.'", confidence: 77, page: 5, posX: 80, posY: 180, posW: 520, posH: 66, suggestedGround: "s7_2fi", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Free and frank opinion from a staff member about the adequacy of cultural competency training. The staff member would expect this internal feedback to remain confidential.", source: "ai" },
  ];
  await upsertDetections(req011Dets);

  // Content for doc-072
  const doc072Content: InputJsonValue = [
    { heading: "Meeting Minutes", segments: [{ text: "MULTICULTURAL ADVISORY COMMITTEE\nMeeting Minutes — 19 March 2025\nVenue: Council Community Room, Level 2\nChair: Cr. P. Kaur" }] },
    { heading: "1. Attendance", segments: [
      { text: "Present: Cr. P. Kaur (Chair), Cr. T. Mitchell, " },
      { text: "Amara Osei", detectionId: "det-120" },
      { text: " (African Community Representative), " },
      { text: "Wei Lin Chen", detectionId: "det-121" },
      { text: " (phone: " },
      { text: "022 198 3347", detectionId: "det-122" },
      { text: ") (Chinese Community Representative), H. Patel (Indian Community Association), F. Abdi (Somali Community), K. Ruiz (Latin American Network).\n\nApologies: R. Kim (Korean Community), S. Nguyen (Vietnamese Community)." },
    ] },
    { heading: "2. Minutes of Previous Meeting", segments: [{ text: "The minutes of the meeting held on 19 February 2025 were confirmed as a true and correct record.\nMoved: Cr. Mitchell | Seconded: H. Patel | Carried" }] },
    { heading: "3. Community Safety Concerns", segments: [{ text: "Ms Osei reported several incidents of racial harassment in the town centre during the previous month. She requested the committee formally write to Council requesting increased CCTV monitoring and better lighting on Victoria Street between 6pm and midnight." }] },
    { heading: "4. Multicultural Festival 2025", segments: [{ text: "The committee discussed plans for the annual Multicultural Festival scheduled for 15 November 2025. Mr Chen offered to coordinate food vendor registrations. Budget request: $18,500 (same as 2024). The committee resolved to submit a formal funding application to the Community Grants Fund." }] },
    { heading: "5. Language Access Services", segments: [{ text: "The committee noted that the council's website and key forms are currently available only in English and Te Reo Māori. The committee recommends adding Hindi, Simplified Chinese, and Somali translations for the top 10 most-used council forms. Estimated cost: $8,000–$12,000." }] },
    { heading: "6. General Business", segments: [{ text: "The committee acknowledged the recent appointment of the council's first Diversity and Inclusion Advisor (to commence April 2025) and expressed support for the role.\n\nThe meeting closed at 6:45pm.\n\nNext meeting: 16 April 2025" }] },
    { segments: [{ text: "\nMinutes confirmed by: Cr. P. Kaur, Chair\nClassification: Public — Subject to LGOIMA review for personal information" }] },
  ];
  await prisma.document.update({ where: { id: "doc-072" }, data: { contentJson: doc072Content } });
  console.log(`  ✓ req-011: ${req011Docs.length} documents + ${req011Dets.length} detections`);

  // ============================================================
  // req-012: Roading contractor dispute (status: senior-review, 42 docs)
  // ============================================================
  const req012Docs = [
    { id: "doc-080", caseId: "req-012", name: "Legal_Opinion_Chapman_Tripp.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 4200 * 1024, pageCount: 18, status: "submitted", detectionCount: 34, avgConfidence: 87, assigneeId: "u-005" },
    { id: "doc-081", caseId: "req-012", name: "Settlement_Agreement_Draft_v4.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 2800 * 1024, pageCount: 14, status: "submitted", detectionCount: 28, avgConfidence: 91, assigneeId: "u-005" },
    { id: "doc-082", caseId: "req-012", name: "Mediation_Summary_Dec2024.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 1600 * 1024, pageCount: 10, status: "submitted", detectionCount: 22, avgConfidence: 84, assigneeId: "u-005" },
    { id: "doc-083", caseId: "req-012", name: "Email_CEO_to_Mayor_Re_Settlement.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 310 * 1024, pageCount: 4, status: "submitted", detectionCount: 16, avgConfidence: 80, assigneeId: "u-005" },
    { id: "doc-084", caseId: "req-012", name: "Contractor_Performance_Report.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 5100 * 1024, pageCount: 26, status: "submitted", detectionCount: 19, avgConfidence: 78, assigneeId: "u-003" },
    { id: "doc-085", caseId: "req-012", name: "Insurance_Claim_Defective_Works.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3400 * 1024, pageCount: 16, status: "submitted", detectionCount: 12, avgConfidence: 86, assigneeId: "u-003" },
  ];
  await upsertDocs(req012Docs);

  const req012Dets = [
    { id: "det-130", documentId: "doc-080", type: "legal-privilege", text: "Chapman Tripp advises that the council's position on the negligence claim is strong, but the quantum of damages ($2.3M) would likely be reduced to approximately $1.4M after contributory negligence is taken into account. We recommend settling within the range of $1.0M–$1.5M to avoid the uncertainty and cost of litigation.", confidence: 92, page: 4, posX: 80, posY: 200, posW: 520, posH: 88, suggestedGround: "s7_2g", appliedGround: "s7_2g", status: "accepted", reasoning: "Legal advice from external counsel setting out the council's legal position and settlement strategy. Clearly subject to legal professional privilege.", piConsideration: "While there is public interest in how public funds are used in settlements, the substance of legal advice must be protected to preserve the council's ability to obtain frank legal counsel.", aiExplanation: "Legal advice from Chapman Tripp containing the firm's assessment of the council's litigation position, including specific quantum analysis and settlement recommendations. This is clearly privileged legal advice.", source: "ai" },
    { id: "det-131", documentId: "doc-080", type: "commercial", text: "The contractor's annual turnover is approximately $28M, of which council contracts represent 35%", confidence: 78, page: 6, posX: 80, posY: 350, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Commercial financial information about a private contractor.", piConsideration: "Disclosure would reveal commercially sensitive business information about a private company's revenue composition.", aiExplanation: "Financial information about a private contractor including turnover and council contract dependency. This constitutes trade information that could prejudice the contractor's commercial position.", source: "ai" },
    { id: "det-132", documentId: "doc-081", type: "commercial", text: "Settlement amount: $1,250,000 plus GST, payable in three instalments over 12 months", confidence: 88, page: 2, posX: 80, posY: 300, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Specific settlement amount in a draft agreement. This is a use of public funds that may have a strong public interest argument for disclosure, though the draft nature of the agreement is relevant.", source: "ai" },
    { id: "det-133", documentId: "doc-083", type: "free-frank", text: "Mayor, I believe we should settle this matter before it becomes public. The reputational damage to the council if the full extent of the road failures becomes known would be far more costly than the settlement amount. The engineering team's original sign-off on the defective work is an embarrassment we can't afford.", confidence: 85, page: 2, posX: 80, posY: 150, posW: 520, posH: 88, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "CEO's frank opinion to the Mayor about reputational risk and strategic reasons for settlement.", piConsideration: "Strong public interest in the CEO's candid assessment of the situation, but protecting the free and frank channel between CEO and Mayor is important for effective governance.", aiExplanation: "Email from the CEO to the Mayor containing frank strategic advice about settling a dispute to avoid reputational damage. References the council's internal engineering failure, making this both politically and operationally sensitive.", source: "ai" },
  ];
  await upsertDetections(req012Dets);

  // Content for doc-083
  const doc083Content: InputJsonValue = [
    { heading: "Internal Correspondence", segments: [{ text: "Subject: Settlement — Roading Contractor Dispute\nDate: 22 January 2026\nFrom: CEO\nTo: Mayor (Confidential)" }] },
    { segments: [
      { text: "Dear Mayor,\n\nI am writing to recommend that the council proceed to settle the dispute with [Contractor] regarding the defective road construction works on State Highway bypass project.\n\n" },
      { text: "Mayor, I believe we should settle this matter before it becomes public. The reputational damage to the council if the full extent of the road failures becomes known would be far more costly than the settlement amount. The engineering team's original sign-off on the defective work is an embarrassment we can't afford.", detectionId: "det-133" },
    ] },
    { segments: [
      { text: "\n\nOur legal advisors Chapman Tripp have reviewed the matter and assessed our position. Their advice (attached separately) recommends settling in the range of $1.0M–$1.5M.\n\nI recommend we authorise the settlement under delegated authority (within the $1.5M threshold) to avoid the need for a public council decision that would attract media attention.\n\nI have discussed this informally with the Deputy Mayor and Cr. Henderson, who are both supportive of a quiet resolution.\n\nPlease advise if you are comfortable to proceed.\n\nRegards,\nChief Executive" },
    ] },
    { segments: [{ text: "\n---\nClassification: CONFIDENTIAL\nNot for circulation beyond Mayor and Deputy Mayor" }] },
  ];
  await prisma.document.update({ where: { id: "doc-083" }, data: { contentJson: doc083Content } });
  console.log(`  ✓ req-012: ${req012Docs.length} documents + ${req012Dets.length} detections`);

  // ============================================================
  // req-014: Resource consent RC-2025-1847 (status: ready-export, 128 docs)
  // ============================================================
  const req014Docs = [
    { id: "doc-090", caseId: "req-014", name: "Officer_Report_RC-2025-1847.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 7800 * 1024, pageCount: 44, status: "approved", detectionCount: 38, avgConfidence: 83, assigneeId: "u-004" },
    { id: "doc-091", caseId: "req-014", name: "Peer_Review_Stormwater_Design.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3200 * 1024, pageCount: 20, status: "approved", detectionCount: 12, avgConfidence: 87, assigneeId: "u-004" },
    { id: "doc-092", caseId: "req-014", name: "Hearing_Panel_Decision.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 4500 * 1024, pageCount: 28, status: "approved", detectionCount: 22, avgConfidence: 85, assigneeId: "u-005" },
    { id: "doc-093", caseId: "req-014", name: "Submitter_Correspondence_Bundle.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 12000 * 1024, pageCount: 56, status: "approved", detectionCount: 67, avgConfidence: 79, assigneeId: "u-003" },
    { id: "doc-094", caseId: "req-014", name: "Traffic_Engineering_Assessment.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 5600 * 1024, pageCount: 32, status: "approved", detectionCount: 9, avgConfidence: 90, assigneeId: "u-004" },
    { id: "doc-095", caseId: "req-014", name: "Applicant_Response_to_Submissions.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 2800 * 1024, pageCount: 16, status: "approved", detectionCount: 14, avgConfidence: 82, assigneeId: "u-005" },
  ];
  await upsertDocs(req014Docs);
  console.log(`  ✓ req-014: ${req014Docs.length} documents (ready-export)`);

  // ============================================================
  // req-015: Freshwater management (status: in-review, 189 docs)
  // ============================================================
  const req015Docs = [
    { id: "doc-100", caseId: "req-015", name: "Freshwater_Management_Plan_2024.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 9200 * 1024, pageCount: 52, status: "in-review", detectionCount: 18, avgConfidence: 82, assigneeId: "u-008" },
    { id: "doc-101", caseId: "req-015", name: "Nitrate_Monitoring_Data_Q1-Q4_2025.xlsx", fileType: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 2100 * 1024, pageCount: 14, status: "in-review", detectionCount: 8, avgConfidence: 78, assigneeId: "u-008" },
    { id: "doc-102", caseId: "req-015", name: "Regional_Council_Correspondence.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 560 * 1024, pageCount: 8, status: "approved", detectionCount: 14, avgConfidence: 81, assigneeId: "u-008" },
    { id: "doc-103", caseId: "req-015", name: "Farm_Nutrient_Budget_Assessments.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 4800 * 1024, pageCount: 28, status: "in-review", detectionCount: 32, avgConfidence: 76, assigneeId: "u-004" },
    { id: "doc-104", caseId: "req-015", name: "Groundwater_Quality_Technical_Report.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 6400 * 1024, pageCount: 36, status: "ready", detectionCount: 11, avgConfidence: 89, assigneeId: null },
    { id: "doc-105", caseId: "req-015", name: "Email_Federated_Farmers_Meeting_Notes.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 280 * 1024, pageCount: 4, status: "in-review", detectionCount: 9, avgConfidence: 77, assigneeId: "u-008" },
  ];
  await upsertDocs(req015Docs);
  console.log(`  ✓ req-015: ${req015Docs.length} documents (in-review)`);

  // ============================================================
  // req-016: Playgrounds & sports (status: qa, 93 docs)
  // ============================================================
  const req016Docs = [
    { id: "doc-110", caseId: "req-016", name: "Playground_Inspection_Report_Jan2026.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3200 * 1024, pageCount: 18, status: "approved", detectionCount: 14, avgConfidence: 83, assigneeId: "u-007" },
    { id: "doc-111", caseId: "req-016", name: "Maintenance_Contract_Parks_Grounds.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 5600 * 1024, pageCount: 32, status: "approved", detectionCount: 28, avgConfidence: 86, assigneeId: "u-007" },
    { id: "doc-112", caseId: "req-016", name: "Sports_Facility_Usage_Data_Q1_2026.xlsx", fileType: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 890 * 1024, pageCount: 6, status: "approved", detectionCount: 4, avgConfidence: 91, assigneeId: "u-007" },
    { id: "doc-113", caseId: "req-016", name: "Contractor_Safety_Incident_Report.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 1200 * 1024, pageCount: 8, status: "approved", detectionCount: 18, avgConfidence: 79, assigneeId: "u-005" },
    { id: "doc-114", caseId: "req-016", name: "Email_Complaint_Broken_Swing_Set.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 180 * 1024, pageCount: 3, status: "approved", detectionCount: 8, avgConfidence: 85, assigneeId: "u-007" },
  ];
  await upsertDocs(req016Docs);
  console.log(`  ✓ req-016: ${req016Docs.length} documents (qa)`);

  // ============================================================
  // req-017: CEO employment contract (status: ingesting, 156 docs)
  // ============================================================
  const req017Docs = [
    { id: "doc-120", caseId: "req-017", name: "CEO_Employment_Agreement_2024.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 4200 * 1024, pageCount: 24, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-121", caseId: "req-017", name: "Remuneration_Benchmarking_Report.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3800 * 1024, pageCount: 20, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-122", caseId: "req-017", name: "Performance_Review_CEO_2025.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 2100 * 1024, pageCount: 12, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-123", caseId: "req-017", name: "Confidential_Council_Minutes_PEX.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 1800 * 1024, pageCount: 10, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-124", caseId: "req-017", name: "Email_Thread_Recruitment_Consultant.msg", fileType: "msg", mimeType: "application/vnd.ms-outlook", sizeBytes: 680 * 1024, pageCount: 8, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-125", caseId: "req-017", name: "Independent_Review_CEO_Conduct.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 5400 * 1024, pageCount: 28, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
  ];
  await upsertDocs(req017Docs);
  console.log(`  ✓ req-017: ${req017Docs.length} documents (ingesting)`);

  // ============================================================
  // Add content to existing doc-016 (req-002: Devon St land sale)
  // ============================================================
  const det200 = [
    { id: "det-200", documentId: "doc-016", type: "commercial", text: "Current market valuation: $4.2M (as at September 2025). The 2020 rateable value was $2.8M. The increase reflects the rezoning of the site from commercial to mixed-use in the 2023 District Plan review.", confidence: 86, page: 3, posX: 80, posY: 200, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Current market valuation and valuation history of council property. Releasing during an active sale process could prejudice the council's commercial position.", piConsideration: "Public interest in how council assets are valued and sold, but active negotiations make this information commercially sensitive.", aiExplanation: "Specific valuation figures for a council-owned property currently being considered for sale. Includes historical comparison showing value appreciation due to rezoning.", source: "ai" },
    { id: "det-201", documentId: "doc-016", type: "commercial", text: "Three offers received: Offer A — $3.8M (conditional on consent), Offer B — $4.1M (unconditional, 90-day settlement), Offer C — $3.95M (conditional, with leaseback arrangement)", confidence: 89, page: 5, posX: 80, posY: 300, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: "s7_2bii", status: "accepted", reasoning: "Specific offer amounts from identified parties in an active property transaction.", piConsideration: "While there is public interest in how council disposes of assets, revealing competing offer details during negotiations could prejudice the process.", aiExplanation: "Details of three competing offers for council-owned land, including specific dollar amounts and conditions. This is clearly commercially sensitive information during an active sale.", source: "ai" },
    { id: "det-202", documentId: "doc-016", type: "personal-name", text: "Gregory Maxwell", confidence: 91, page: 5, posX: 200, posY: 380, posW: 160, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Name of a private property developer who submitted one of the purchase offers.", piConsideration: "Private individual involved in a commercial transaction with the council.", aiExplanation: "Name of a property developer associated with one of the purchase offers for council land.", source: "ai" },
    { id: "det-203", documentId: "doc-016", type: "free-frank", text: "The Property Manager recommends accepting Offer B despite it not being the highest possible return, as the unconditional nature and short settlement reduce execution risk. The last two conditional sales of council property fell through at significant cost.", confidence: 81, page: 8, posX: 80, posY: 150, posW: 520, posH: 66, suggestedGround: "s7_2fi", appliedGround: "s7_2fi", status: "accepted", reasoning: "Staff recommendation on property sale strategy, including frank assessment of risk.", piConsideration: "Free and frank advice to decision-makers on a commercial matter. Staff must be able to provide candid risk assessments.", aiExplanation: "Internal staff recommendation favouring one offer over others, with frank assessment of institutional risk based on past failed sales. This is clearly free and frank advice.", source: "ai" },
  ];
  await upsertDetections(det200);

  const doc016Content: InputJsonValue = [
    { heading: "Property Valuation Report", segments: [{ text: "COUNCIL-OWNED LAND — 45 DEVON STREET EAST\nPrepared for: District Council Property Committee\nDate: 15 February 2026 | Reference: PROP-2026-008" }] },
    { heading: "1. Property Description", segments: [{ text: "The subject property is a 2,840m² freehold site located at 45 Devon Street East, currently zoned Mixed Use under the operative District Plan. The site is improved with a single-storey commercial building (c.1968, 1,200m² GFA) currently used as council storage. The building is at end of life and has no heritage value." }] },
    { heading: "2. Valuation", segments: [
      { text: "An independent market valuation was commissioned from Colliers International in September 2025.\n\n" },
      { text: "Current market valuation: $4.2M (as at September 2025). The 2020 rateable value was $2.8M. The increase reflects the rezoning of the site from commercial to mixed-use in the 2023 District Plan review.", detectionId: "det-200" },
      { text: "\n\nThe valuation assumes vacant possession, demolition of the existing building by the purchaser, and development potential of up to 6 storeys under the Mixed Use zone provisions." },
    ] },
    { heading: "3. Offers Received", segments: [
      { text: "Following a confidential expressions-of-interest process conducted in January 2026, the council received three offers:\n\n" },
      { text: "Three offers received: Offer A — $3.8M (conditional on consent), Offer B — $4.1M (unconditional, 90-day settlement), Offer C — $3.95M (conditional, with leaseback arrangement)", detectionId: "det-201" },
      { text: "\n\nOffer B was submitted by " },
      { text: "Gregory Maxwell", detectionId: "det-202" },
      { text: " of Maxwell Development Group Ltd. Offers A and C were from entities who requested their identities remain confidential during the process." },
    ] },
    { heading: "4. Staff Recommendation", segments: [
      { text: "The Property Manager recommends accepting Offer B despite it not being the highest possible return, as the unconditional nature and short settlement reduce execution risk. The last two conditional sales of council property fell through at significant cost.", detectionId: "det-203" },
    ] },
    { heading: "5. Next Steps", segments: [{ text: "If the Property Committee endorses the staff recommendation, the sale will be presented to the full Council for formal approval at the 12 March 2026 meeting. Public notification under the Local Government Act 2002 will be required as the property exceeds the significance threshold in the council's Significance and Engagement Policy." }] },
    { segments: [{ text: "\nReport prepared by: Property Services Team\nClassification: CONFIDENTIAL — Active commercial negotiation\nLGOIMA: Subject to s7(2)(b)(ii) and s7(2)(f)(i)" }] },
  ];
  await prisma.document.update({ where: { id: "doc-016" }, data: { contentJson: doc016Content } });
  console.log(`  ✓ req-002: doc-016 content + 4 detections`);

  // ============================================================
  // Add content to existing doc-020 (req-007: Flood damage assessment)
  // ============================================================
  const det210 = [
    { id: "det-210", documentId: "doc-020", type: "personal-name", text: "Margaret & Hone Te Raukura", confidence: 93, page: 3, posX: 150, posY: 200, posW: 240, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Names of residential property owners whose home sustained flood damage. They are private individuals, not public officials.", source: "ai" },
    { id: "det-211", documentId: "doc-020", type: "address", text: "28 Riverside Drive, Riverdale 4310", confidence: 95, page: 3, posX: 150, posY: 225, posW: 300, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Residential address of flood-affected homeowners. NZ address format with postcode.", source: "ai" },
    { id: "det-212", documentId: "doc-020", type: "commercial", text: "Insurance claim lodged: $1.45M for infrastructure damage to the Northern Trunk Main. Insurer has indicated potential coverage dispute on $380,000 of the claim relating to pre-existing pipe deterioration.", confidence: 84, page: 8, posX: 80, posY: 300, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Insurance claim details including a potential coverage dispute. Disclosure could prejudice the council's negotiating position with the insurer.", source: "ai" },
    { id: "det-213", documentId: "doc-020", type: "free-frank", text: "The stormwater network in the northern suburbs was known to be under-capacity prior to the February event. The 2019 infrastructure strategy identified the need for a $4.5M upgrade, but this was deferred due to budget constraints. In hindsight, the deferral was a false economy.", confidence: 80, page: 12, posX: 80, posY: 150, posW: 520, posH: 66, suggestedGround: "s7_2fi", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Staff candid assessment that a previous budget decision to defer infrastructure upgrades contributed to the flood damage. This is free and frank opinion about a politically sensitive matter — the council's infrastructure investment decisions.", source: "ai" },
    { id: "det-214", documentId: "doc-020", type: "personal-name", text: "Dr. Rajesh Nair", confidence: 88, page: 15, posX: 200, posY: 280, posW: 150, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of a consulting hydrologist engaged to assess flood modelling accuracy. As a professional consultant, their name may be releasable.", source: "ai" },
  ];
  await upsertDetections(det210);

  const doc020Content: InputJsonValue = [
    { heading: "Flood Damage Assessment", segments: [{ text: "NORTHERN SUBURBS — FEBRUARY 2026 EVENT\nPrepared for: District Council Emergency Management\nDate: 8 March 2026 | Report No: EMGT-2026-003" }] },
    { heading: "1. Event Summary", segments: [{ text: "On 14–15 February 2026, the district experienced an extreme rainfall event with 180mm recorded over 18 hours at the Council rainfall gauge. This exceeded the 1-in-100-year design event (155mm/18hrs). The northern suburbs were the worst-affected area, with surface flooding across 14 streets and floodwater intrusion into 23 residential properties." }] },
    { heading: "2. Affected Properties", segments: [
      { text: "The most severely affected properties were in the Riverside Drive / Creek Road area. Property owners " },
      { text: "Margaret & Hone Te Raukura", detectionId: "det-210" },
      { text: " of " },
      { text: "28 Riverside Drive, Riverdale 4310", detectionId: "det-211" },
      { text: " reported floodwater reaching 400mm above floor level, causing extensive damage to ground-floor contents and requiring temporary evacuation to the community hall." },
    ] },
    { heading: "3. Infrastructure Damage", segments: [
      { text: "Significant damage was sustained to council stormwater infrastructure:\n\n• Northern Trunk Main — partial collapse at chainage 1,450m\n• Three culvert headwalls — erosion damage requiring replacement\n• Creek Road retaining wall — undermining (50m section)\n• Pump Station #3 — electrical failure due to inundation\n\n" },
      { text: "Insurance claim lodged: $1.45M for infrastructure damage to the Northern Trunk Main. Insurer has indicated potential coverage dispute on $380,000 of the claim relating to pre-existing pipe deterioration.", detectionId: "det-212" },
    ] },
    { heading: "4. Contributing Factors", segments: [
      { text: "While the rainfall intensity exceeded design standards, staff assessment indicates that infrastructure capacity was a contributing factor.\n\n" },
      { text: "The stormwater network in the northern suburbs was known to be under-capacity prior to the February event. The 2019 infrastructure strategy identified the need for a $4.5M upgrade, but this was deferred due to budget constraints. In hindsight, the deferral was a false economy.", detectionId: "det-213" },
    ] },
    { heading: "5. Flood Modelling Review", segments: [
      { text: "A post-event review of the council's flood model was commissioned from " },
      { text: "Dr. Rajesh Nair", detectionId: "det-214" },
      { text: " (Tonkin & Taylor). Preliminary findings indicate that the 2018 model underestimated peak flows by approximately 22% due to changes in catchment impermeability since the model was calibrated.\n\nA revised flood model incorporating updated impervious surface data and climate change projections is recommended. Estimated cost: $85,000." },
    ] },
    { heading: "6. Recommendations", segments: [{ text: "That Council:\n(a) Notes the damage assessment and insurance claim status;\n(b) Approves emergency repairs to the Northern Trunk Main ($620,000 from the emergency works budget);\n(c) Commissions a revised flood model for the northern catchment;\n(d) Reviews the deferred infrastructure programme with updated priority scores." }] },
    { segments: [{ text: "\nReport prepared by: Infrastructure — Stormwater Team\nClassification: In-Confidence — Subject to LGOIMA review" }] },
  ];
  await prisma.document.update({ where: { id: "doc-020" }, data: { contentJson: doc020Content } });
  console.log(`  ✓ req-007: doc-020 content + 5 detections`);

  // ============================================================
  // Update case document counts to match actual doc counts
  // ============================================================
  const caseCounts: Record<string, { documentCount: number; reviewedCount: number; redactionCount: number }> = {
    "req-003": { documentCount: 213, reviewedCount: 0, redactionCount: 0 },
    "req-004": { documentCount: 156, reviewedCount: 156, redactionCount: 892 },
    "req-005": { documentCount: 78, reviewedCount: 78, redactionCount: 312 },
    "req-009": { documentCount: 512, reviewedCount: 0, redactionCount: 0 },
    "req-011": { documentCount: 34, reviewedCount: 22, redactionCount: 78 },
    "req-012": { documentCount: 42, reviewedCount: 42, redactionCount: 567 },
    "req-014": { documentCount: 128, reviewedCount: 128, redactionCount: 743 },
    "req-015": { documentCount: 189, reviewedCount: 56, redactionCount: 345 },
    "req-016": { documentCount: 93, reviewedCount: 93, redactionCount: 412 },
    "req-017": { documentCount: 156, reviewedCount: 0, redactionCount: 0 },
  };
  for (const [caseId, counts] of Object.entries(caseCounts)) {
    await prisma.case.update({ where: { id: caseId }, data: counts });
  }
  console.log(`  ✓ Updated case document counts`);

  // ============================================================
  // Add extra audit entries for the new cases
  // ============================================================
  const extraAudit = [
    { id: "aud-040", timestamp: new Date("2026-03-18T08:30:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-045", caseId: "req-003", detail: "Requester: Community Trust, Deadline: 15 Apr 2026" },
    { id: "aud-041", timestamp: new Date("2026-03-18T09:00:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "ingestion", description: "Uploaded 213 documents", target: "LGOIMA-2026-045", caseId: "req-003", detail: "Total size: 145MB" },
    { id: "aud-042", timestamp: new Date("2026-03-21T08:00:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-048", caseId: "req-009", detail: "Requester: Residents' Association, Deadline: 15 Apr 2026" },
    { id: "aud-043", timestamp: new Date("2026-03-21T08:30:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "ingestion", description: "Uploaded 512 documents (ZIP archive)", target: "LGOIMA-2026-048", caseId: "req-009", detail: "Total size: 890MB, File types: PDF (312), DOCX (89), XLSX (34), EML (42), other (35)" },
    { id: "aud-044", timestamp: new Date("2026-03-22T08:15:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-049", caseId: "req-011" },
    { id: "aud-045", timestamp: new Date("2026-03-23T09:00:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case (urgent)", target: "LGOIMA-2026-051", caseId: "req-017", detail: "Requester: Stuff Ltd, Priority: urgent" },
    { id: "aud-046", timestamp: new Date("2026-03-23T09:30:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "ingestion", description: "Uploaded 156 documents (encrypted ZIP)", target: "LGOIMA-2026-051", caseId: "req-017", detail: "Total size: 234MB. Contains highly sensitive employment records." },
  ];
  for (const a of extraAudit) {
    await prisma.auditEntry.upsert({
      where: { id: a.id },
      update: a,
      create: a,
    });
  }
  console.log(`  ✓ ${extraAudit.length} extra audit entries`);

  console.log("\nExtra seed complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
