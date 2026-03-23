import { PrismaClient } from "../lib/generated/prisma/client";
import type { Prisma } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

type InputJsonValue = Prisma.InputJsonValue;

const connectionString = process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5432/veil";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding Veil database...");

  // --- Departments ---
  const departments = [
    { id: "dept-001", name: "Infrastructure" },
    { id: "dept-002", name: "Planning" },
    { id: "dept-003", name: "Legal" },
    { id: "dept-004", name: "Community Services" },
    { id: "dept-005", name: "Finance" },
    { id: "dept-006", name: "Environmental Services" },
    { id: "dept-007", name: "Parks & Recreation" },
  ];

  for (const d of departments) {
    await prisma.department.upsert({
      where: { id: d.id },
      update: { name: d.name },
      create: d,
    });
  }
  console.log(`  ✓ ${departments.length} departments`);

  // --- Users (with department assignments + dev passwords) ---
  // All seeded users get password "password" for local credentials login
  const devPasswordHash = await bcrypt.hash("password", 10);

  const users = [
    { id: "u-001", name: "A. Richardson", email: "a.richardson@local.govt.nz", role: "request-manager", departmentId: "dept-003", passwordHash: devPasswordHash },
    { id: "u-002", name: "B. Mitchell", email: "b.mitchell@local.govt.nz", role: "request-manager", departmentId: "dept-001", passwordHash: devPasswordHash },
    { id: "u-003", name: "K. Williams", email: "k.williams@local.govt.nz", role: "reviewer", departmentId: "dept-001", passwordHash: devPasswordHash },
    { id: "u-004", name: "M. Patel", email: "m.patel@local.govt.nz", role: "reviewer", departmentId: "dept-002", passwordHash: devPasswordHash },
    { id: "u-005", name: "J. Chen", email: "j.chen@local.govt.nz", role: "senior-reviewer", departmentId: "dept-003", passwordHash: devPasswordHash },
    { id: "u-006", name: "D. Harper", email: "d.harper@local.govt.nz", role: "final-approver", departmentId: "dept-003", passwordHash: devPasswordHash },
    { id: "u-007", name: "S. Thompson", email: "s.thompson@local.govt.nz", role: "reviewer", departmentId: "dept-004", passwordHash: devPasswordHash },
    { id: "u-008", name: "L. Ngata", email: "l.ngata@local.govt.nz", role: "reviewer", departmentId: "dept-006", passwordHash: devPasswordHash },
    { id: "u-009", name: "R. Henare", email: "r.henare@local.govt.nz", role: "senior-reviewer", departmentId: "dept-001", passwordHash: devPasswordHash },
    { id: "u-010", name: "T. Morgan", email: "t.morgan@local.govt.nz", role: "admin", departmentId: "dept-005", passwordHash: devPasswordHash },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { name: u.name, email: u.email, role: u.role, departmentId: u.departmentId, passwordHash: u.passwordHash },
      create: u,
    });
  }
  console.log(`  ✓ ${users.length} users (password: "password")`);

  // --- Cases (18 total — varied statuses, departments, requester types) ---
  const cases = [
    {
      id: "req-001",
      reference: "LGOIMA-2026-042",
      requesterName: "J. Smith",
      requesterType: "Individual",
      dateReceived: new Date("2026-03-15"),
      deadline: new Date("2026-04-08"),
      priority: "standard",
      departments: ["Infrastructure", "Planning"],
      description: "All documents, correspondence, and internal communications relating to the Coastal Walkway Extension Project, including consultation submissions, cost estimates, and engineering reports from January 2025 to present.",
      status: "in-review",
      documentCount: 347,
      reviewedCount: 198,
      redactionCount: 2156,
    },
    {
      id: "req-002",
      reference: "LGOIMA-2026-039",
      requesterName: "Regional Daily News",
      requesterType: "Media",
      dateReceived: new Date("2026-03-10"),
      deadline: new Date("2026-04-03"),
      priority: "standard",
      departments: ["Planning", "Legal"],
      description: "Documents relating to the proposed sale of council-owned land at 45 Devon Street East, including valuations, offers received, and council deliberations.",
      status: "senior-review",
      documentCount: 89,
      reviewedCount: 89,
      redactionCount: 456,
    },
    {
      id: "req-003",
      reference: "LGOIMA-2026-045",
      requesterName: "Community Trust",
      requesterType: "Organisation",
      dateReceived: new Date("2026-03-18"),
      deadline: new Date("2026-04-15"),
      priority: "standard",
      departments: ["Community Services"],
      description: "Funding applications and assessment documents for community grants awarded in the 2025/26 financial year.",
      status: "ingesting",
      documentCount: 213,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-004",
      reference: "LGOIMA-2026-038",
      requesterName: "R. Te Huia",
      requesterType: "Individual",
      dateReceived: new Date("2026-03-05"),
      deadline: new Date("2026-03-28"),
      priority: "standard",
      departments: ["Planning", "Environmental Services"],
      description: "Resource consent applications and related reports for industrial activities in the eastern industrial area, 2024-2026.",
      status: "released",
      documentCount: 156,
      reviewedCount: 156,
      redactionCount: 892,
    },
    {
      id: "req-005",
      reference: "LGOIMA-2026-041",
      requesterName: "Green Party — Local Branch",
      requesterType: "Political",
      dateReceived: new Date("2026-03-12"),
      deadline: new Date("2026-04-06"),
      priority: "urgent",
      departments: ["Infrastructure"],
      description: "Reports, assessments, and communications regarding the Three Waters reform transition and impact on council water services.",
      status: "final-approval",
      documentCount: 78,
      reviewedCount: 78,
      redactionCount: 312,
    },
    {
      id: "req-006",
      reference: "LGOIMA-2026-047",
      requesterName: "T. Anderson",
      requesterType: "Individual",
      dateReceived: new Date("2026-03-20"),
      deadline: new Date("2026-04-14"),
      priority: "standard",
      departments: ["Planning"],
      description: "All building consent applications and inspection reports for properties at 12-28 Marine Parade, including any code compliance certificates issued in 2025.",
      status: "draft",
      documentCount: 0,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-007",
      reference: "LGOIMA-2026-044",
      requesterName: "NZ Herald",
      requesterType: "Media",
      dateReceived: new Date("2026-03-16"),
      deadline: new Date("2026-04-10"),
      priority: "urgent",
      departments: ["Finance", "Legal"],
      description: "All correspondence and reports relating to the council's insurance claims following the February 2026 flooding event, including loss assessments and insurer communications.",
      status: "in-review",
      documentCount: 234,
      reviewedCount: 87,
      redactionCount: 1423,
    },
    {
      id: "req-008",
      reference: "LGOIMA-2026-036",
      requesterName: "M. & S. Walker",
      requesterType: "Individual",
      dateReceived: new Date("2026-03-01"),
      deadline: new Date("2026-03-25"),
      priority: "standard",
      departments: ["Environmental Services"],
      description: "Environmental monitoring data and compliance reports for the wastewater treatment plant discharge consent, 2024-2026.",
      status: "released",
      documentCount: 67,
      reviewedCount: 67,
      redactionCount: 189,
    },
    {
      id: "req-009",
      reference: "LGOIMA-2026-048",
      requesterName: "Residents' Association",
      requesterType: "Organisation",
      dateReceived: new Date("2026-03-21"),
      deadline: new Date("2026-04-15"),
      priority: "standard",
      departments: ["Infrastructure", "Parks & Recreation"],
      description: "Plans, design documents, and public consultation submissions for the proposed Town Centre Revitalisation Project.",
      status: "ingesting",
      documentCount: 512,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-010",
      reference: "LGOIMA-2026-035",
      requesterName: "Labour Party — Local Electorate",
      requesterType: "Political",
      dateReceived: new Date("2026-02-28"),
      deadline: new Date("2026-03-22"),
      priority: "standard",
      departments: ["Finance"],
      description: "All documents relating to the council's Long-Term Plan 2027-2037 financial modelling, including rate projections and debt scenarios.",
      status: "released",
      documentCount: 45,
      reviewedCount: 45,
      redactionCount: 234,
    },
    {
      id: "req-011",
      reference: "LGOIMA-2026-049",
      requesterName: "P. Kaur",
      requesterType: "Individual",
      dateReceived: new Date("2026-03-22"),
      deadline: new Date("2026-04-16"),
      priority: "standard",
      departments: ["Community Services"],
      description: "Minutes, agendas, and reports from the Multicultural Advisory Committee meetings from January 2025 to present.",
      status: "in-review",
      documentCount: 34,
      reviewedCount: 22,
      redactionCount: 78,
    },
    {
      id: "req-012",
      reference: "LGOIMA-2026-043",
      requesterName: "RNZ",
      requesterType: "Media",
      dateReceived: new Date("2026-03-15"),
      deadline: new Date("2026-04-09"),
      priority: "standard",
      departments: ["Legal", "Infrastructure"],
      description: "All legal opinions, settlement agreements, and mediation documents relating to the failed roading contractor dispute (2024-2025).",
      status: "senior-review",
      documentCount: 42,
      reviewedCount: 42,
      redactionCount: 567,
    },
    {
      id: "req-013",
      reference: "LGOIMA-2026-050",
      requesterName: "Chamber of Commerce",
      requesterType: "Organisation",
      dateReceived: new Date("2026-03-23"),
      deadline: new Date("2026-04-17"),
      priority: "standard",
      departments: ["Finance", "Planning"],
      description: "Economic development strategy documents, business attraction proposals, and funding applications submitted to central government in 2025/26.",
      status: "draft",
      documentCount: 0,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-014",
      reference: "LGOIMA-2026-037",
      requesterName: "K. O'Brien (Solicitor)",
      requesterType: "Legal",
      dateReceived: new Date("2026-03-03"),
      deadline: new Date("2026-03-27"),
      priority: "urgent",
      departments: ["Planning", "Legal"],
      description: "All documents relating to resource consent RC-2025-1847, including officer reports, peer reviews, hearing panel decisions, and related correspondence.",
      status: "ready-export",
      documentCount: 128,
      reviewedCount: 128,
      redactionCount: 743,
    },
    {
      id: "req-015",
      reference: "LGOIMA-2026-046",
      requesterName: "Federated Farmers",
      requesterType: "Organisation",
      dateReceived: new Date("2026-03-19"),
      deadline: new Date("2026-04-13"),
      priority: "standard",
      departments: ["Environmental Services", "Planning"],
      description: "Freshwater management plans, nitrate monitoring data, and correspondence with regional council regarding rural water quality, 2024-2026.",
      status: "in-review",
      documentCount: 189,
      reviewedCount: 56,
      redactionCount: 345,
    },
    {
      id: "req-016",
      reference: "LGOIMA-2026-040",
      requesterName: "D. Hsu",
      requesterType: "Individual",
      dateReceived: new Date("2026-03-11"),
      deadline: new Date("2026-04-04"),
      priority: "standard",
      departments: ["Parks & Recreation"],
      description: "Maintenance schedules, contractor agreements, and inspection reports for public playgrounds and sports facilities, January-March 2026.",
      status: "qa",
      documentCount: 93,
      reviewedCount: 93,
      redactionCount: 412,
    },
    {
      id: "req-017",
      reference: "LGOIMA-2026-051",
      requesterName: "Stuff Ltd",
      requesterType: "Media",
      dateReceived: new Date("2026-03-23"),
      deadline: new Date("2026-04-17"),
      priority: "urgent",
      departments: ["Finance", "Legal"],
      description: "All documents relating to the CEO's employment contract review, including remuneration benchmarking, performance reviews, and council deliberations in confidential session.",
      status: "ingesting",
      documentCount: 156,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-018",
      reference: "LGOIMA-2026-034",
      requesterName: "A. Wiremu",
      requesterType: "Individual",
      dateReceived: new Date("2026-02-25"),
      deadline: new Date("2026-03-20"),
      priority: "standard",
      departments: ["Infrastructure", "Environmental Services"],
      description: "Stormwater management plans, flood modelling reports, and engineering assessments for the northern suburbs catchment area.",
      status: "released",
      documentCount: 72,
      reviewedCount: 72,
      redactionCount: 523,
    },
  ];

  for (const c of cases) {
    await prisma.case.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }
  console.log(`  ✓ ${cases.length} cases`);

  // --- Documents (attached to req-001, req-002, req-007) ---
  const documents = [
    // req-001: Coastal Walkway Extension
    { id: "doc-001", caseId: "req-001", name: "Council_Report_Coastal_Walkway_v3.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 4200 * 1024, pageCount: 28, status: "approved", detectionCount: 45, avgConfidence: 82, assigneeId: "u-003" },
    { id: "doc-002", caseId: "req-001", name: "Budget_Estimate_2025-26.xlsx", fileType: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 890 * 1024, pageCount: 12, status: "in-review", detectionCount: 23, avgConfidence: 76, assigneeId: "u-004" },
    { id: "doc-003", caseId: "req-001", name: "Email_Thread_Project_Manager_15Mar.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 340 * 1024, pageCount: 5, status: "in-review", detectionCount: 18, avgConfidence: 71, assigneeId: "u-003" },
    { id: "doc-004", caseId: "req-001", name: "Consultation_Submission_001.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 450 * 1024, pageCount: 3, status: "approved", detectionCount: 12, avgConfidence: 91, assigneeId: "u-004" },
    { id: "doc-005", caseId: "req-001", name: "Engineering_Assessment_Stage2.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 12500 * 1024, pageCount: 45, status: "in-review", detectionCount: 67, avgConfidence: 78, assigneeId: "u-003" },
    { id: "doc-006", caseId: "req-001", name: "Internal_Memo_Cost_Overrun.docx", fileType: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 180 * 1024, pageCount: 2, status: "ready", detectionCount: 8, avgConfidence: 85, assigneeId: null },
    { id: "doc-007", caseId: "req-001", name: "Contractor_Quote_MainWorks.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 1200 * 1024, pageCount: 8, status: "approved", detectionCount: 34, avgConfidence: 88, assigneeId: "u-005" },
    { id: "doc-008", caseId: "req-001", name: "Community_Feedback_Summary.docx", fileType: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 670 * 1024, pageCount: 15, status: "in-review", detectionCount: 29, avgConfidence: 73, assigneeId: "u-004" },
    { id: "doc-009", caseId: "req-001", name: "Email_Legal_Advice_Easement.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 210 * 1024, pageCount: 3, status: "submitted", detectionCount: 15, avgConfidence: 92, assigneeId: "u-003" },
    { id: "doc-010", caseId: "req-001", name: "Meeting_Minutes_Infrastructure_Committee.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 520 * 1024, pageCount: 6, status: "ready", detectionCount: 11, avgConfidence: 80, assigneeId: null },
    { id: "doc-011", caseId: "req-001", name: "Site_Photos_Coastal_Path.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 18000 * 1024, pageCount: 20, status: "approved", detectionCount: 3, avgConfidence: 95, assigneeId: "u-005" },
    { id: "doc-012", caseId: "req-001", name: "Risk_Assessment_Erosion.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 2300 * 1024, pageCount: 14, status: "pending", detectionCount: 0, avgConfidence: 0, assigneeId: null },
    { id: "doc-013", caseId: "req-001", name: "Submission_Iwi_Consultation.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 1100 * 1024, pageCount: 9, status: "in-review", detectionCount: 22, avgConfidence: 84, assigneeId: "u-004" },
    { id: "doc-014", caseId: "req-001", name: "Draft_Media_Statement.docx", fileType: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 95 * 1024, pageCount: 2, status: "approved", detectionCount: 5, avgConfidence: 77, assigneeId: "u-003" },
    { id: "doc-015", caseId: "req-001", name: "Financial_Summary_Q3_2025.xlsx", fileType: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 340 * 1024, pageCount: 8, status: "ready", detectionCount: 19, avgConfidence: 86, assigneeId: null },

    // req-002: Council-owned land sale
    { id: "doc-016", caseId: "req-002", name: "Valuation_Report_Devon_St.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 3200 * 1024, pageCount: 18, status: "approved", detectionCount: 28, avgConfidence: 84, assigneeId: "u-005" },
    { id: "doc-017", caseId: "req-002", name: "Council_Deliberation_Minutes.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 780 * 1024, pageCount: 12, status: "approved", detectionCount: 35, avgConfidence: 79, assigneeId: "u-005" },
    { id: "doc-018", caseId: "req-002", name: "Offer_Letter_Redacted_Draft.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 450 * 1024, pageCount: 4, status: "submitted", detectionCount: 14, avgConfidence: 91, assigneeId: "u-003" },
    { id: "doc-019", caseId: "req-002", name: "Email_Property_Manager_Feb2026.eml", fileType: "eml", mimeType: "message/rfc822", sizeBytes: 280 * 1024, pageCount: 6, status: "approved", detectionCount: 19, avgConfidence: 73, assigneeId: "u-004" },

    // req-007: Insurance claims (flood)
    { id: "doc-020", caseId: "req-007", name: "Flood_Damage_Assessment_Northern.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 8900 * 1024, pageCount: 42, status: "in-review", detectionCount: 56, avgConfidence: 81, assigneeId: "u-003" },
    { id: "doc-021", caseId: "req-007", name: "Insurance_Claim_Summary.xlsx", fileType: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 1200 * 1024, pageCount: 8, status: "in-review", detectionCount: 31, avgConfidence: 77, assigneeId: "u-007" },
    { id: "doc-022", caseId: "req-007", name: "Email_Thread_Insurer_Negotiations.msg", fileType: "msg", mimeType: "application/vnd.ms-outlook", sizeBytes: 560 * 1024, pageCount: 14, status: "ready", detectionCount: 22, avgConfidence: 85, assigneeId: null },
    { id: "doc-023", caseId: "req-007", name: "Infrastructure_Repair_Costs.pdf", fileType: "pdf", mimeType: "application/pdf", sizeBytes: 2400 * 1024, pageCount: 16, status: "in-review", detectionCount: 18, avgConfidence: 74, assigneeId: "u-008" },
  ];

  for (const d of documents) {
    await prisma.document.upsert({
      where: { id: d.id },
      update: d,
      create: d,
    });
  }
  console.log(`  ✓ ${documents.length} documents`);

  // --- Detections ---
  const detections = [
    // doc-001: Council_Report_Coastal_Walkway_v3.pdf
    { id: "det-001", documentId: "doc-001", type: "personal-name", text: "John Smith", confidence: 95, page: 1, posX: 120, posY: 245, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Personal name of a private submitter to the consultation process.", piConsideration: "No overriding public interest — private individual, not acting in an official capacity.", aiExplanation: "Personal name detected in the context of a public consultation submission. The individual appears to be a private citizen providing feedback on the Coastal Walkway project.", source: "ai" },
    { id: "det-002", documentId: "doc-001", type: "phone", text: "021 555 7823", confidence: 99, page: 1, posX: 120, posY: 270, posW: 150, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Personal mobile phone number of the submitter.", piConsideration: "No public interest in disclosing private phone numbers.", aiExplanation: "NZ mobile phone number (021 prefix) found adjacent to a personal name in a submission document.", source: "ai" },
    { id: "det-003", documentId: "doc-001", type: "address", text: "42 Rata Street, Greenfield 4310", confidence: 88, page: 1, posX: 120, posY: 295, posW: 280, posH: 22, suggestedGround: "s7_2a", appliedGround: "s7_2a", status: "accepted", reasoning: "Residential address of the submitter.", piConsideration: "No public interest in disclosing residential addresses.", aiExplanation: "New Zealand residential address detected. Street number, street name with recognised NZ street type, city name, and NZ postcode format.", source: "ai" },
    { id: "det-004", documentId: "doc-001", type: "commercial", text: "$1.2M budget allocation for Stage 2 earthworks, with MainWorks Ltd quoting $890,000 for the contract", confidence: 72, page: 3, posX: 80, posY: 180, posW: 520, posH: 44, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "This text references specific budget allocations and contractor pricing for the Coastal Walkway project. The contractor quote amount could prejudice future procurement negotiations if released, as it reveals the council's cost expectations and the contractor's pricing position.", source: "ai" },
    { id: "det-005", documentId: "doc-001", type: "free-frank", text: "I recommend the committee defer the Stage 2 decision until the geotechnical report is complete. Proceeding without it exposes the council to significant liability.", confidence: 78, page: 4, posX: 80, posY: 120, posW: 520, posH: 66, suggestedGround: "s7_2f", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Internal staff recommendation to the Infrastructure Committee. This appears to be a free and frank opinion on the timing of a significant infrastructure decision, expressing professional judgement about risk. Withholding may protect the ability of staff to provide candid advice to decision-makers.", source: "ai" },
    { id: "det-006", documentId: "doc-001", type: "personal-name", text: "Sarah Thompson", confidence: 92, page: 2, posX: 200, posY: 400, posW: 160, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Personal name detected in the context of a complaint about noise from construction. The individual appears to be a resident affected by the project.", source: "ai" },
    { id: "det-007", documentId: "doc-001", type: "email-addr", text: "s.thompson@gmail.com", confidence: 97, page: 2, posX: 200, posY: 425, posW: 220, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Personal email address found adjacent to the name Sarah Thompson. Gmail domain indicates personal (not business) email.", source: "ai" },
    { id: "det-008", documentId: "doc-001", type: "ird", text: "12-345-678", confidence: 96, page: 5, posX: 340, posY: 310, posW: 120, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Pattern matches NZ IRD number format (XX-XXX-XXX). Modulus-11 check digit validation passed. Found in a contractor payment form within the document set.", source: "ai" },
    { id: "det-009", documentId: "doc-001", type: "legal-privilege", text: "Legal advice from Simpson Grierson dated 12 February 2026 regarding the council\u2019s obligations under the Resource Management Act with respect to the coastal erosion risk...", confidence: 89, page: 7, posX: 80, posY: 200, posW: 520, posH: 66, suggestedGround: "s7_2g", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Reference to legal advice from an identified law firm (Simpson Grierson). Content describes the substance of legal advice regarding council obligations, which is likely subject to legal professional privilege under s7(2)(g).", source: "ai" },
    { id: "det-010", documentId: "doc-001", type: "personal-name", text: "the applicant", confidence: 38, page: 6, posX: 150, posY: 350, posW: 130, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Generic reference to 'the applicant' \u2014 this may or may not identify a specific individual depending on context. Low confidence as the term is commonly used in official documents without identifying a person.", source: "ai" },
    { id: "det-011", documentId: "doc-001", type: "commercial", text: "Project contingency of $340,000", confidence: 65, page: 8, posX: 200, posY: 150, posW: 300, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Specific contingency amount for the project. Releasing this could inform future contractor negotiations and reveal the council's risk budget.", source: "ai" },
    { id: "det-012", documentId: "doc-001", type: "personal-name", text: "Councillor M. Bridges", confidence: 42, page: 9, posX: 100, posY: 280, posW: 200, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of a councillor \u2014 an elected public official. This is likely NOT a valid ground for withholding as councillors act in their public capacity. Low confidence for redaction.", source: "ai" },

    // doc-002: Budget_Estimate_2025-26.xlsx
    { id: "det-013", documentId: "doc-002", type: "commercial", text: "Proposed annual maintenance budget of $2.4M allocated across 14 contractor agreements", confidence: 82, page: 2, posX: 80, posY: 120, posW: 480, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Aggregate budget allocation referencing multiple contractor agreements. Disclosure could reveal council's procurement capacity and pricing expectations to future tenderers.", source: "ai" },
    { id: "det-014", documentId: "doc-002", type: "personal-name", text: "D. Watkins", confidence: 91, page: 1, posX: 200, posY: 80, posW: 120, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of a council finance officer who prepared the budget estimate. As a staff member acting in their official capacity, this may not require withholding.", source: "ai" },
    { id: "det-015", documentId: "doc-002", type: "commercial", text: "Contractor A unit rate: $185/m for kerb replacement; Contractor B quoted $210/m", confidence: 88, page: 4, posX: 80, posY: 300, posW: 500, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Specific contractor unit rates for infrastructure work. Releasing this information could prejudice the commercial position of these companies in future tenders and reveal council's price benchmarking data.", source: "ai" },
    { id: "det-016", documentId: "doc-002", type: "ird", text: "49-876-321", confidence: 97, page: 8, posX: 300, posY: 200, posW: 120, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "IRD number found in a payment schedule. Modulus-11 check digit validation passed. This is a tax identifier that should be withheld.", source: "ai" },
    { id: "det-017", documentId: "doc-002", type: "personal-name", text: "Maria Chen", confidence: 93, page: 5, posX: 120, posY: 350, posW: 130, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of a contractor employee listed as the account manager on a vendor invoice. Personal name in a commercial context.", source: "ai" },
    { id: "det-018", documentId: "doc-002", type: "phone", text: "06 759 4200", confidence: 45, page: 3, posX: 200, posY: 150, posW: 130, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Landline phone number with local area code (06). This appears to be a council main reception number rather than a personal number. Low confidence for redaction.", source: "ai" },
    { id: "det-019", documentId: "doc-002", type: "free-frank", text: "The Finance Manager recommends deferring the roading programme to free up $800K for the wastewater upgrade \u2014 this is not a politically popular option", confidence: 76, page: 7, posX: 80, posY: 420, posW: 520, posH: 44, suggestedGround: "s7_2f", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Internal staff opinion about budget prioritisation, explicitly noting political sensitivity. This is free and frank expression of opinion that staff provided in the expectation of confidentiality.", source: "ai" },
    { id: "det-020", documentId: "doc-002", type: "commercial", text: "$340,000 contingency for unforeseen remediation costs on the Mangati Stream culvert", confidence: 71, page: 6, posX: 80, posY: 250, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Specific contingency amount for a named infrastructure project. Releasing this could inform future contractor negotiations.", source: "ai" },

    // doc-003: Email_Thread_Project_Manager_15Mar.eml
    { id: "det-021", documentId: "doc-003", type: "email-addr", text: "r.henare@local.govt.nz", confidence: 72, page: 1, posX: 150, posY: 60, posW: 250, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Council staff email address. This is a work email for an employee acting in their official capacity. Withholding may not be justified as this is public-facing contact information.", source: "ai" },
    { id: "det-022", documentId: "doc-003", type: "personal-name", text: "Rachel Henare", confidence: 94, page: 1, posX: 150, posY: 40, posW: 150, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of the Group Manager Infrastructure. As a senior council officer acting in an official capacity, this name is generally releasable.", source: "ai" },
    { id: "det-023", documentId: "doc-003", type: "free-frank", text: "Between us \u2014 I think the committee is going to push back hard on the Stage 2 timeline. The Mayor wants it done before the election but the engineering just isn\u2019t there yet.", confidence: 84, page: 2, posX: 80, posY: 180, posW: 520, posH: 66, suggestedGround: "s7_2f", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Informal staff communication expressing a frank opinion about political dynamics and project feasibility. The phrase 'between us' signals an expectation of confidence. References the Mayor which adds political sensitivity.", source: "ai" },
    { id: "det-024", documentId: "doc-003", type: "personal-name", text: "Tom Bracegirdle", confidence: 89, page: 3, posX: 200, posY: 300, posW: 170, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of a private individual who appears to be a property owner adjacent to the walkway route. Referenced in context of an access negotiation.", source: "ai" },
    { id: "det-025", documentId: "doc-003", type: "address", text: "17 Ocean View Parade, Coastal Heights 4312", confidence: 92, page: 3, posX: 200, posY: 325, posW: 300, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Residential address of a property owner involved in an access negotiation. New Zealand address format with postcode.", source: "ai" },
    { id: "det-026", documentId: "doc-003", type: "phone", text: "027 334 8821", confidence: 98, page: 3, posX: 200, posY: 350, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Personal mobile number (027 prefix) found adjacent to a personal name and address. Clearly personal contact information.", source: "ai" },
    { id: "det-027", documentId: "doc-003", type: "legal-privilege", text: "Following the advice we received from Chapman Tripp last week, we should not proceed with the compulsory acquisition route \u2014 the legal risk is too high given the Treaty implications", confidence: 86, page: 4, posX: 80, posY: 100, posW: 520, posH: 44, suggestedGround: "s7_2g", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Reference to legal advice from Chapman Tripp, with a summary of the advice's conclusion. The substance of legal professional privilege is disclosed in this sentence.", source: "ai" },

    // doc-005: Engineering_Assessment_Stage2.pdf
    { id: "det-028", documentId: "doc-005", type: "personal-name", text: "Dr. P. Kamau", confidence: 90, page: 1, posX: 300, posY: 100, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Name of an external engineering consultant who authored the assessment. As a professional engaged by council, their name may be releasable but their personal details should be protected.", source: "ai" },
    { id: "det-029", documentId: "doc-005", type: "commercial", text: "Engineering consultancy fee proposal: $95,000 for geotechnical investigation including 12 boreholes and laboratory testing", confidence: 85, page: 3, posX: 80, posY: 200, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Specific fee proposal from an engineering consultancy. Releasing this would reveal the consultant's pricing structure and the council's spend on professional services for this project.", source: "ai" },
    { id: "det-030", documentId: "doc-005", type: "confidential", text: "CONFIDENTIAL: Preliminary results indicate significant coastal erosion risk along the proposed alignment between chainage 2400-2800. Cliff recession rate estimated at 0.3-0.5m per year.", confidence: 79, page: 12, posX: 80, posY: 150, posW: 520, posH: 44, suggestedGround: "s7_2ba", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Preliminary technical findings marked CONFIDENTIAL. Release of preliminary erosion data before the final report could cause public alarm and affect property values in the area. However, there may be strong public interest in disclosure of safety-related information.", source: "ai" },
    { id: "det-031", documentId: "doc-005", type: "personal-name", text: "James & Alison Whitaker", confidence: 87, page: 15, posX: 200, posY: 300, posW: 220, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Names of property owners whose land may be affected by the proposed walkway alignment. Referenced in context of potential land acquisition.", source: "ai" },
    { id: "det-032", documentId: "doc-005", type: "commercial", text: "Estimated land acquisition cost: $1.8M for three properties along the preferred route", confidence: 74, page: 16, posX: 80, posY: 100, posW: 520, posH: 22, suggestedGround: "s7_2bii", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Aggregate land acquisition budget that indirectly reveals the council's valuation expectations for specific properties. Release could prejudice property negotiations.", source: "ai" },
    { id: "det-033", documentId: "doc-005", type: "free-frank", text: "In my professional opinion, Route Option B presents unacceptable geotechnical risk and should be abandoned despite being the preferred option in the community consultation", confidence: 81, page: 20, posX: 80, posY: 400, posW: 520, posH: 44, suggestedGround: "s7_2f", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Professional engineering opinion that contradicts the community's preferred option. This is free and frank expression of professional judgement that could influence public debate about the project route.", source: "ai" },
    { id: "det-034", documentId: "doc-005", type: "phone", text: "021 887 4433", confidence: 96, page: 15, posX: 400, posY: 325, posW: 140, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Personal mobile number associated with a property owner referenced in the land acquisition section.", source: "ai" },
    { id: "det-035", documentId: "doc-005", type: "email-addr", text: "j.whitaker@xtra.co.nz", confidence: 95, page: 15, posX: 400, posY: 350, posW: 230, posH: 22, suggestedGround: "s7_2a", appliedGround: null, status: "pending", reasoning: "", piConsideration: "", aiExplanation: "Personal email address (xtra.co.nz domain) of a property owner. Clearly personal correspondence address.", source: "ai" },
  ];

  for (const d of detections) {
    await prisma.detection.upsert({
      where: { id: d.id },
      update: d,
      create: d,
    });
  }
  console.log(`  ✓ ${detections.length} detections`);

  // --- Document content (stored as JSON on Document) ---
  const doc001Content = [
    { heading: "District Council", segments: [{ text: "INFRASTRUCTURE COMMITTEE REPORT\nCoastal Walkway Extension Project \u2014 Stage 2 Update\nReport Date: 28 February 2026 | Report No: IC-2026-014" }] },
    { heading: "1. Purpose", segments: [{ text: "This report provides the Infrastructure Committee with an update on the Coastal Walkway Extension Project (Stage 2). It summarises progress on community consultation, engineering assessments, procurement, and budget considerations." }] },
    { heading: "2. Community Consultation Summary", segments: [{ text: "During the public consultation period (15 January \u2013 28 February 2026), the Council received 342 submissions. Submitters included residents, community groups, iwi representatives, and business owners. The following submission was selected for inclusion in this report as a representative example." }] },
    { segments: [{ text: "Submitter: " }, { text: "John Smith", detectionId: "det-001" }, { text: "\nPhone: " }, { text: "021 555 7823", detectionId: "det-002" }, { text: "\nAddress: " }, { text: "42 Rata Street, Greenfield 4310", detectionId: "det-003" }, { text: "\n\n\"I support the extension of the Coastal Walkway. It will provide a safe cycling route for families and reduce traffic on the state highway. I urge the Council to prioritise native planting along the route and to consult further with local iwi regarding sites of cultural significance near the bridge approach.\"" }] },
    { segments: [{ text: "A separate complaint was received from " }, { text: "Sarah Thompson", detectionId: "det-006" }, { text: " (" }, { text: "s.thompson@gmail.com", detectionId: "det-007" }, { text: ") regarding excessive construction noise on Devon Street during early morning concrete pours. Council staff responded within two working days and adjusted the work schedule to commence no earlier than 7:30am." }] },
    { heading: "3. Budget and Procurement", segments: [{ text: "The approved project budget for Stage 2 is $4.8M across the 2025/26 and 2026/27 financial years. The major earthworks package was tendered in November 2025, with three compliant bids received." }] },
    { segments: [{ text: "$1.2M budget allocation for Stage 2 earthworks, with MainWorks Ltd quoting $890,000 for the contract", detectionId: "det-004" }, { text: ". The remaining two bids were from Contractor A ($1.04M) and Contractor B ($975,000). The evaluation panel recommended MainWorks Ltd based on price, methodology, and relevant experience." }] },
    { segments: [{ text: "The finance team has noted a " }, { text: "Project contingency of $340,000", detectionId: "det-011" }, { text: " is held within the overall programme budget. Drawdown on contingency requires Infrastructure Committee approval for amounts exceeding $50,000." }] },
    { heading: "4. Engineering and Risk Assessment", segments: [{ text: "I recommend the committee defer the Stage 2 decision until the geotechnical report is complete. Proceeding without it exposes the council to significant liability.", detectionId: "det-005" }] },
    { segments: [{ text: "This recommendation was provided by the Group Manager Infrastructure, Dr. R. Henare, following a site inspection on 14 February 2026. The geotechnical investigation is currently underway and due for completion by 31 March 2026." }] },
    { heading: "5. Contractor Payment Records", segments: [{ text: "Progress payment #3 for Stage 1 remediation works was processed on 20 February 2026. The contractor\u2019s IRD number on file is " }, { text: "12-345-678", detectionId: "det-008" }, { text: ". All tax invoices have been verified by the Finance team and comply with council procurement policy." }] },
    { heading: "6. Resource Consent Matters", segments: [{ text: "Council planning staff have been liaising with " }, { text: "the applicant", detectionId: "det-010" }, { text: " regarding conditions of consent RC-2025-1847. The application relates to earthworks within 20m of the coastal marine area, and regional council concurrence is required under s13 of the RMA." }] },
    { heading: "7. Legal Advice", segments: [{ text: "Legal advice from Simpson Grierson dated 12 February 2026 regarding the council\u2019s obligations under the Resource Management Act with respect to the coastal erosion risk...", detectionId: "det-009" }] },
    { segments: [{ text: "The advice confirms that Council has a duty to assess natural hazard risk under Part 2 of the RMA and that the proposed alignment should take into account projected sea-level rise data from NIWA\u2019s 2024 assessment. Council\u2019s in-house legal team concurs with this advice." }] },
    { heading: "8. Recommendations", segments: [{ text: "That the Infrastructure Committee:\n(a) Receives this report;\n(b) Notes the community consultation outcomes;\n(c) Approves the preferred contractor for Stage 2 earthworks;\n(d) Defers final route confirmation pending the geotechnical report." }] },
    { segments: [{ text: "Noted by " }, { text: "Councillor M. Bridges", detectionId: "det-012" }, { text: " that the Committee should also consider the impact on the estuary and request an ecological assessment before proceeding." }] },
    { segments: [{ text: "\nReport prepared by: Planning & Infrastructure Division\nDistrict Council\nDate: 28 February 2026\nClassification: In-Confidence \u2014 Subject to LGOIMA Review" }] },
  ];

  const doc002Content = [
    { heading: "District Council", segments: [{ text: "BUDGET ESTIMATE 2025/26\nInfrastructure Capital Programme\nPrepared: January 2026 | Version: 3.1" }] },
    { heading: "1. Overview", segments: [{ text: "This document sets out the capital expenditure budget estimates for the 2025/26 financial year across all infrastructure portfolios. It has been prepared by " }, { text: "D. Watkins", detectionId: "det-014" }, { text: ", Finance Manager \u2014 Infrastructure, for consideration by the Finance and Audit Committee." }] },
    { heading: "2. Programme Summary", segments: [{ text: "The total infrastructure capital programme for 2025/26 is $18.7M. The breakdown by portfolio is as follows: Roading ($6.2M), Water ($4.8M), Wastewater ($3.1M), Stormwater ($2.2M), Parks & Open Spaces ($1.4M), Coastal ($1.0M)." }] },
    { segments: [{ text: "The major procurement packages account for the bulk of this expenditure. " }, { text: "Proposed annual maintenance budget of $2.4M allocated across 14 contractor agreements", detectionId: "det-013" }, { text: ", with three major contractors holding the largest contracts." }] },
    { heading: "3. Council Contact", segments: [{ text: "For budget queries, contact Finance \u2014 Infrastructure at " }, { text: "06 759 4200", detectionId: "det-018" }, { text: " or via the council website." }] },
    { heading: "4. Contractor Unit Rates (Confidential)", segments: [{ text: "The following unit rates were submitted during the 2024/25 tender process and are used as the basis for 2025/26 budget estimates:\n\n" }, { text: "Contractor A unit rate: $185/m for kerb replacement; Contractor B quoted $210/m", detectionId: "det-015" }, { text: ". These rates are subject to CPI adjustment at contract anniversary." }] },
    { heading: "5. Vendor Payment Schedule", segments: [{ text: "Payment records reference vendor account manager " }, { text: "Maria Chen", detectionId: "det-017" }, { text: " (MainWorks Ltd). Monthly progress claims are processed on the 20th of each month." }] },
    { segments: [{ text: "The Mangati Stream project carries a " }, { text: "$340,000 contingency for unforeseen remediation costs on the Mangati Stream culvert", detectionId: "det-020" }, { text: ". This contingency is held centrally and requires GM Infrastructure approval for any drawdown." }] },
    { heading: "6. Staff Recommendations", segments: [{ text: "The Finance Manager recommends deferring the roading programme to free up $800K for the wastewater upgrade \u2014 this is not a politically popular option", detectionId: "det-019" }, { text: ". This recommendation is based on asset condition assessments showing that the wastewater network presents a higher public health risk than deferred road resurfacing." }] },
    { heading: "7. Tax Records", segments: [{ text: "Contractor tax compliance verification: IRD number " }, { text: "49-876-321", detectionId: "det-016" }, { text: " (Contractor B Ltd). All contractors have current tax certificates on file as required under procurement policy." }] },
    { segments: [{ text: "\nDocument Classification: In-Confidence\nNot for public release without LGOIMA review" }] },
  ];

  const doc003Content = [
    { heading: "Email Thread", segments: [{ text: "Subject: RE: Coastal Walkway Stage 2 \u2014 Timeline Update\nDate: 15 March 2026\nThread: 4 messages" }] },
    { heading: "Message 1 of 4", segments: [{ text: "From: " }, { text: "Rachel Henare", detectionId: "det-022" }, { text: " <" }, { text: "r.henare@local.govt.nz", detectionId: "det-021" }, { text: ">\nTo: Project Team (Coastal Walkway)\nDate: 15 March 2026 09:14\n\nTeam,\n\nJust a heads up on the Stage 2 timeline. The geotech report is running two weeks behind due to laboratory testing delays. This pushes our committee paper back to the April cycle." }] },
    { heading: "Message 2 of 4", segments: [{ text: "From: B. Mitchell <b.mitchell@local.govt.nz>\nTo: Rachel Henare\nDate: 15 March 2026 09:42\n\n" }, { text: "Between us \u2014 I think the committee is going to push back hard on the Stage 2 timeline. The Mayor wants it done before the election but the engineering just isn\u2019t there yet.", detectionId: "det-023" }, { text: "\n\nWe need to manage expectations carefully. I'll draft some talking points for the GM." }] },
    { heading: "Message 3 of 4", segments: [{ text: "From: Rachel Henare\nTo: B. Mitchell\nDate: 15 March 2026 10:15\n\nAgreed. On a related matter \u2014 we still need to sort the access issue at the coastal end. The adjacent property owner, " }, { text: "Tom Bracegirdle", detectionId: "det-024" }, { text: ", at " }, { text: "17 Ocean View Parade, Coastal Heights 4312", detectionId: "det-025" }, { text: " (mobile: " }, { text: "027 334 8821", detectionId: "det-026" }, { text: "), has been difficult to reach. We may need to explore the compulsory acquisition option if negotiations don't progress by end of month." }] },
    { heading: "Message 4 of 4", segments: [{ text: "From: B. Mitchell\nTo: Rachel Henare\nDate: 15 March 2026 11:03\n\n" }, { text: "Following the advice we received from Chapman Tripp last week, we should not proceed with the compulsory acquisition route \u2014 the legal risk is too high given the Treaty implications", detectionId: "det-027" }, { text: ". Let's keep negotiating and explore whether council can offer an easement arrangement instead.\n\nI'll set up a meeting with the property team for next week." }] },
    { segments: [{ text: "\n--- End of thread ---\nClassification: In-Confidence" }] },
  ];

  const doc005Content = [
    { heading: "Engineering Assessment Report", segments: [{ text: "Coastal Walkway Extension \u2014 Stage 2\nGeotechnical and Route Assessment\nPrepared for: District Council" }] },
    { heading: "1. Report Author", segments: [{ text: "This assessment was prepared by " }, { text: "Dr. P. Kamau", detectionId: "det-028" }, { text: ", Principal Geotechnical Engineer, under commission from the Council. The assessment covers geotechnical conditions, route options, and risk factors for the Stage 2 alignment." }] },
    { heading: "2. Scope and Methodology", segments: [{ text: "The investigation comprised 12 machine boreholes to depths of 8-15m, 24 hand auger probes, laboratory testing of 48 soil samples, and desktop review of existing geological mapping. Field work was conducted between 18 January and 12 February 2026." }] },
    { heading: "3. Professional Fees", segments: [{ text: "Engineering consultancy fee proposal: $95,000 for geotechnical investigation including 12 boreholes and laboratory testing", detectionId: "det-029" }, { text: ". This fee was accepted under delegated authority on 10 December 2025. Additional testing has been quoted at $12,500." }] },
    { heading: "4. Route Options Analysis", segments: [{ text: "Three route options were evaluated:\n\n\u2022 Route A (Inland): Follows the existing state highway corridor. Lower geotechnical risk but requires NZTA approvals and offers poor scenic amenity.\n\u2022 Route B (Coastal): Follows the cliff edge with sea views. Highest amenity but significant erosion risk.\n\u2022 Route C (Hybrid): Inland alignment with coastal sections where geology permits. Moderate risk, moderate amenity." }] },
    { heading: "5. Preliminary Findings (Confidential)", segments: [{ text: "CONFIDENTIAL: Preliminary results indicate significant coastal erosion risk along the proposed alignment between chainage 2400-2800. Cliff recession rate estimated at 0.3-0.5m per year.", detectionId: "det-030" }, { text: "\n\nThis rate is consistent with NIWA\u2019s regional assessment but exceeds the 0.2m/year assumed in the original feasibility study. The implications for Route B are significant \u2014 a 50-year design life would require a minimum setback of 25m from the current cliff edge." }] },
    { heading: "6. Land Acquisition Requirements", segments: [{ text: "Route C (recommended) requires partial acquisition of three private properties along Ocean View Parade. The affected landowners include " }, { text: "James & Alison Whitaker", detectionId: "det-031" }, { text: " (phone: " }, { text: "021 887 4433", detectionId: "det-034" }, { text: ", email: " }, { text: "j.whitaker@xtra.co.nz", detectionId: "det-035" }, { text: ")." }] },
    { segments: [{ text: "Estimated land acquisition cost: $1.8M for three properties along the preferred route", detectionId: "det-032" }, { text: ". This estimate is based on current market valuations and includes a 15% contingency for negotiation costs and legal fees." }] },
    { heading: "7. Professional Opinion", segments: [{ text: "In my professional opinion, Route Option B presents unacceptable geotechnical risk and should be abandoned despite being the preferred option in the community consultation", detectionId: "det-033" }, { text: ". The cliff recession data is clear \u2014 any path constructed within 15m of the cliff edge would require replacement within 20 years. Route C provides a viable compromise that balances safety, amenity, and cost." }] },
    { heading: "8. Recommendations", segments: [{ text: "That the Council:\n(a) Adopts Route C (Hybrid) as the preferred alignment;\n(b) Commences land acquisition negotiations with affected property owners;\n(c) Commissions a detailed design for Route C;\n(d) Considers a coastal monitoring programme to track cliff recession." }] },
    { segments: [{ text: "\nEngineering Consultants Ltd\nMarch 2026\nClassification: Confidential \u2014 Subject to LGOIMA Review" }] },
  ];

  // Update documents with content JSON
  const contentMap: Record<string, InputJsonValue> = {
    "doc-001": doc001Content as InputJsonValue,
    "doc-002": doc002Content as InputJsonValue,
    "doc-003": doc003Content as InputJsonValue,
    "doc-005": doc005Content as InputJsonValue,
  };

  for (const [docId, content] of Object.entries(contentMap)) {
    await prisma.document.update({
      where: { id: docId },
      data: { contentJson: content },
    });
  }
  console.log(`  ✓ Document content for ${Object.keys(contentMap).length} documents`);

  // --- Audit entries ---
  const auditEntries = [
    { id: "aud-001", timestamp: new Date("2026-03-15T09:00:12"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-042", caseId: "req-001", detail: "Requester: J. Smith, Deadline: 8 Apr 2026" },
    { id: "aud-002", timestamp: new Date("2026-03-15T09:15:34"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "ingestion", description: "Uploaded 347 documents (ZIP archive)", target: "LGOIMA-2026-042", caseId: "req-001", detail: "Total size: 245MB, File types: PDF (189), DOCX (67), XLSX (23), EML (45), PPTX (8), other (15)" },
    { id: "aud-003", timestamp: new Date("2026-03-15T09:16:01"), userId: null, userName: "Veil System", userRole: "System", type: "ingestion", description: "Document processing started", target: "LGOIMA-2026-042", caseId: "req-001", detail: "347 documents queued for OCR and indexing" },
    { id: "aud-004", timestamp: new Date("2026-03-15T10:45:22"), userId: null, userName: "Veil System", userRole: "System", type: "ingestion", description: "Document processing complete", target: "LGOIMA-2026-042", caseId: "req-001", detail: "345 processed successfully, 2 errors (corrupted files)" },
    { id: "aud-005", timestamp: new Date("2026-03-15T10:46:00"), userId: null, userName: "Veil System", userRole: "System", type: "ingestion", description: "Duplicate detection complete", target: "LGOIMA-2026-042", caseId: "req-001", detail: "12 exact duplicates (3 groups), 4 near-duplicates (2 groups)" },
    { id: "aud-006", timestamp: new Date("2026-03-15T11:00:15"), userId: null, userName: "Veil System", userRole: "System", type: "detection", description: "AI detection pipeline complete", target: "LGOIMA-2026-042", caseId: "req-001", detail: "2,156 detections across 347 documents. High confidence: 1,245 (58%), Medium: 634 (29%), Low: 277 (13%)" },
    { id: "aud-007", timestamp: new Date("2026-03-15T14:30:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "admin", description: "Assigned 50 documents to K. Williams", target: "LGOIMA-2026-042", caseId: "req-001" },
    { id: "aud-008", timestamp: new Date("2026-03-15T14:32:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "admin", description: "Assigned 45 documents to M. Patel", target: "LGOIMA-2026-042", caseId: "req-001" },
    { id: "aud-009", timestamp: new Date("2026-03-16T08:15:00"), userId: "u-003", userName: "K. Williams", userRole: "Reviewer", type: "access", description: "Opened document for review", target: "Council_Report_Coastal_Walkway_v3.pdf", caseId: "req-001" },
    { id: "aud-010", timestamp: new Date("2026-03-16T08:22:30"), userId: "u-003", userName: "K. Williams", userRole: "Reviewer", type: "review", description: "Accepted detection: \"John Smith\" \u2014 Personal privacy", target: "Council_Report_Coastal_Walkway_v3.pdf", caseId: "req-001", detail: "Detection #1, Confidence: 95%, Ground: s7(2)(a)" },
    { id: "aud-011", timestamp: new Date("2026-03-16T08:23:15"), userId: "u-003", userName: "K. Williams", userRole: "Reviewer", type: "review", description: "Accepted detection: \"021 555 7823\" \u2014 Personal privacy", target: "Council_Report_Coastal_Walkway_v3.pdf", caseId: "req-001", detail: "Detection #2, Confidence: 99%, Ground: s7(2)(a)" },
    { id: "aud-012", timestamp: new Date("2026-03-16T08:28:45"), userId: "u-003", userName: "K. Williams", userRole: "Reviewer", type: "review", description: "Rejected detection: \"Councillor M. Bridges\" \u2014 Public official", target: "Council_Report_Coastal_Walkway_v3.pdf", caseId: "req-001", detail: "Detection #12, Confidence: 42%. Reason: Elected public official acting in official capacity." },
    { id: "aud-013", timestamp: new Date("2026-03-16T09:45:00"), userId: "u-003", userName: "K. Williams", userRole: "Reviewer", type: "review", description: "Submitted document to Senior Review", target: "Council_Report_Coastal_Walkway_v3.pdf", caseId: "req-001", detail: "45 detections: 38 accepted, 5 rejected, 2 modified" },
    { id: "aud-014", timestamp: new Date("2026-03-17T10:00:00"), userId: "u-005", userName: "J. Chen", userRole: "Senior Reviewer", type: "approval", description: "Approved document \u2014 no changes", target: "Council_Report_Coastal_Walkway_v3.pdf", caseId: "req-001" },
    { id: "aud-015", timestamp: new Date("2026-03-17T14:30:00"), userId: "u-004", userName: "M. Patel", userRole: "Reviewer", type: "review", description: "Modified detection ground", target: "Email_Legal_Advice_Easement.eml", caseId: "req-001", previousValue: "s7(2)(f) Free and frank", newValue: "s7(2)(g) Legal privilege", detail: "On reflection, this content is legal advice from external counsel, not internal free and frank opinion." },
    { id: "aud-016", timestamp: new Date("2026-03-18T10:42:15"), userId: "u-005", userName: "J. Chen", userRole: "Senior Reviewer", type: "approval", description: "Approved 5 documents for final approval", target: "LGOIMA-2026-042", caseId: "req-001" },
    { id: "aud-017", timestamp: new Date("2026-03-18T11:00:00"), userId: "u-006", userName: "D. Harper", userRole: "Final Approver", type: "approval", description: "Approved for release", target: "Council_Report_Coastal_Walkway_v3.pdf", caseId: "req-001" },
    // Additional audit entries for other cases
    { id: "aud-018", timestamp: new Date("2026-03-10T08:30:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-039", caseId: "req-002", detail: "Requester: Regional Daily News, Deadline: 3 Apr 2026" },
    { id: "aud-019", timestamp: new Date("2026-03-10T09:00:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "ingestion", description: "Uploaded 89 documents", target: "LGOIMA-2026-039", caseId: "req-002", detail: "Total size: 67MB" },
    { id: "aud-020", timestamp: new Date("2026-03-16T09:00:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-044", caseId: "req-007", detail: "Requester: NZ Herald, Priority: urgent, Deadline: 10 Apr 2026" },
    { id: "aud-021", timestamp: new Date("2026-03-16T09:30:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "ingestion", description: "Uploaded 234 documents (mixed archive)", target: "LGOIMA-2026-044", caseId: "req-007", detail: "Total size: 312MB, File types: PDF (124), EML (56), DOCX (38), XLSX (16)" },
    { id: "aud-022", timestamp: new Date("2026-03-05T10:00:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-038", caseId: "req-004", detail: "Requester: R. Te Huia, Deadline: 28 Mar 2026" },
    { id: "aud-023", timestamp: new Date("2026-03-28T16:00:00"), userId: "u-006", userName: "D. Harper", userRole: "Final Approver", type: "export", description: "Released disclosure package to requester", target: "LGOIMA-2026-038", caseId: "req-004", detail: "156 documents released. 892 redactions applied. Withholding schedule attached." },
    { id: "aud-024", timestamp: new Date("2026-03-12T08:00:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case (urgent)", target: "LGOIMA-2026-041", caseId: "req-005", detail: "Requester: Green Party — Local Branch, Priority: urgent" },
    { id: "aud-025", timestamp: new Date("2026-02-28T09:15:00"), userId: "u-001", userName: "A. Richardson", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-035", caseId: "req-010", detail: "Requester: Labour Party — Local Electorate" },
    { id: "aud-026", timestamp: new Date("2026-03-22T15:30:00"), userId: "u-006", userName: "D. Harper", userRole: "Final Approver", type: "export", description: "Released disclosure package to requester", target: "LGOIMA-2026-035", caseId: "req-010", detail: "45 documents released. 234 redactions applied." },
    { id: "aud-027", timestamp: new Date("2026-03-01T11:00:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-036", caseId: "req-008", detail: "Requester: M. & S. Walker" },
    { id: "aud-028", timestamp: new Date("2026-03-25T14:00:00"), userId: "u-006", userName: "D. Harper", userRole: "Final Approver", type: "export", description: "Released disclosure package to requester", target: "LGOIMA-2026-036", caseId: "req-008", detail: "67 documents released. 189 redactions applied." },
    { id: "aud-029", timestamp: new Date("2026-02-25T09:00:00"), userId: "u-002", userName: "B. Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-034", caseId: "req-018", detail: "Requester: A. Wiremu" },
    { id: "aud-030", timestamp: new Date("2026-03-20T16:30:00"), userId: "u-006", userName: "D. Harper", userRole: "Final Approver", type: "export", description: "Released disclosure package to requester", target: "LGOIMA-2026-034", caseId: "req-018", detail: "72 documents released. 523 redactions applied." },
  ];

  for (const a of auditEntries) {
    await prisma.auditEntry.upsert({
      where: { id: a.id },
      update: a,
      create: a,
    });
  }
  console.log(`  ✓ ${auditEntries.length} audit entries`);

  // --- Pipeline milestones + assignments for req-001 ---
  const milestones = [
    { id: "ms-001", caseId: "req-001", stage: "collection", label: "Document Collection", targetDate: new Date("2026-03-18"), completedAt: new Date("2026-03-15"), sortOrder: 1 },
    { id: "ms-002", caseId: "req-001", stage: "processing", label: "AI Processing", targetDate: new Date("2026-03-19"), completedAt: new Date("2026-03-15"), sortOrder: 2 },
    { id: "ms-003", caseId: "req-001", stage: "initial-review", label: "Initial Review", targetDate: new Date("2026-03-27"), completedAt: null, sortOrder: 3 },
    { id: "ms-004", caseId: "req-001", stage: "senior-review", label: "Senior Review", targetDate: new Date("2026-04-02"), completedAt: null, sortOrder: 4 },
    { id: "ms-005", caseId: "req-001", stage: "final-approval", label: "Final Approval", targetDate: new Date("2026-04-04"), completedAt: null, sortOrder: 5 },
    { id: "ms-006", caseId: "req-001", stage: "release", label: "Release", targetDate: new Date("2026-04-08"), completedAt: null, sortOrder: 6 },
  ];

  for (const m of milestones) {
    await prisma.caseMilestone.upsert({
      where: { id: m.id },
      update: m,
      create: m,
    });
  }
  console.log(`  ✓ ${milestones.length} pipeline milestones`);

  const pipelineAssignments = [
    { id: "pa-001", caseId: "req-001", milestoneId: "ms-001", type: "department", departmentId: "dept-001", assignedBy: "A. Richardson" },
    { id: "pa-002", caseId: "req-001", milestoneId: "ms-001", type: "department", departmentId: "dept-002", assignedBy: "A. Richardson" },
    { id: "pa-003", caseId: "req-001", milestoneId: "ms-003", type: "user", userId: "u-003", role: "reviewer", assignedBy: "A. Richardson" },
    { id: "pa-004", caseId: "req-001", milestoneId: "ms-003", type: "user", userId: "u-004", role: "reviewer", assignedBy: "A. Richardson" },
    { id: "pa-005", caseId: "req-001", milestoneId: "ms-004", type: "user", userId: "u-005", role: "senior-reviewer", assignedBy: "A. Richardson" },
    { id: "pa-006", caseId: "req-001", milestoneId: "ms-005", type: "user", userId: "u-006", role: "final-approver", assignedBy: "A. Richardson" },
  ];

  for (const a of pipelineAssignments) {
    await prisma.caseAssignment.upsert({
      where: { id: a.id },
      update: a,
      create: a,
    });
  }
  console.log(`  ✓ ${pipelineAssignments.length} pipeline assignments`);

  // --- Activation: mark instance as activated for development ---
  await prisma.systemSetting.upsert({
    where: { key: "activation_status" },
    update: {},
    create: {
      key: "activation_status",
      value: { activated: true, activatedAt: new Date().toISOString(), activatedBy: "seed" },
      updatedBy: "seed",
    },
  });
  console.log("  ✓ Instance activated (dev seed)");

  console.log("\nSeed complete!");
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
