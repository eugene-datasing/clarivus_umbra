import { PrismaClient } from "../lib/generated/prisma/client";
import type { Prisma } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

type InputJsonValue = Prisma.InputJsonValue;

const connectionString = process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5432/veil";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding Veil database for Palmerston North City Council demo...\n");

  // --- Departments (PNCC structure) ---
  const departments = [
    { id: "dept-001", name: "Infrastructure" },
    { id: "dept-002", name: "Planning & Strategic Development" },
    { id: "dept-003", name: "Legal & Governance" },
    { id: "dept-004", name: "Community Services" },
    { id: "dept-005", name: "Finance & Corporate" },
    { id: "dept-006", name: "Environmental Compliance" },
    { id: "dept-007", name: "Parks & Property" },
    { id: "dept-008", name: "Transport" },
  ];

  for (const d of departments) {
    await prisma.department.upsert({
      where: { id: d.id },
      update: { name: d.name },
      create: d,
    });
  }
  console.log(`  ✓ ${departments.length} departments`);

  // --- Users ---
  // All PNCC staff get password "password" for credentials login.
  // Eugene Cash (DataSing) is SSO-only — no password hash.
  const devPasswordHash = await bcrypt.hash("password", 10);

  const users = [
    // DataSing admin (SSO via Azure AD — no password)
    { id: "u-admin", name: "Eugene Cash", email: "eugene@datasing.com", role: "admin", departmentId: null, passwordHash: null as string | null },

    // PNCC Request Managers
    { id: "u-001", name: "Sarah Mitchell", email: "s.mitchell@pncc.govt.nz", role: "request-manager", departmentId: "dept-003", passwordHash: devPasswordHash },
    { id: "u-002", name: "David Kowalski", email: "d.kowalski@pncc.govt.nz", role: "request-manager", departmentId: "dept-005", passwordHash: devPasswordHash },

    // PNCC Reviewers
    { id: "u-003", name: "Karen Williams", email: "k.williams@pncc.govt.nz", role: "reviewer", departmentId: "dept-001", passwordHash: devPasswordHash },
    { id: "u-004", name: "Ravi Patel", email: "r.patel@pncc.govt.nz", role: "reviewer", departmentId: "dept-002", passwordHash: devPasswordHash },
    { id: "u-005", name: "Aroha Ngata", email: "a.ngata@pncc.govt.nz", role: "reviewer", departmentId: "dept-004", passwordHash: devPasswordHash },
    { id: "u-006", name: "Tom Henderson", email: "t.henderson@pncc.govt.nz", role: "reviewer", departmentId: "dept-006", passwordHash: devPasswordHash },

    // PNCC Senior Reviewers
    { id: "u-007", name: "James Chen", email: "j.chen@pncc.govt.nz", role: "senior-reviewer", departmentId: "dept-003", passwordHash: devPasswordHash },
    { id: "u-008", name: "Rachel Henare", email: "r.henare@pncc.govt.nz", role: "senior-reviewer", departmentId: "dept-001", passwordHash: devPasswordHash },

    // PNCC Final Approver
    { id: "u-009", name: "Diana Harper", email: "d.harper@pncc.govt.nz", role: "final-approver", departmentId: "dept-003", passwordHash: devPasswordHash },

    // PNCC Admin
    { id: "u-010", name: "Tina Morgan", email: "t.morgan@pncc.govt.nz", role: "admin", departmentId: "dept-005", passwordHash: devPasswordHash },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { name: u.name, email: u.email, role: u.role, departmentId: u.departmentId, passwordHash: u.passwordHash },
      create: u,
    });
  }
  console.log(`  ✓ ${users.length} users`);
  console.log(`    → Eugene Cash (eugene@datasing.com) — admin, SSO only`);
  console.log(`    → PNCC staff — password: "password"`);

  // --- Cases (5 realistic PNCC LGOIMA requests — no documents, user will upload) ---
  const cases = [
    {
      id: "req-001",
      reference: "LGOIMA-2026-014",
      requesterName: "Manawatū Standard",
      requesterType: "Media",
      dateReceived: new Date("2026-03-24"),
      deadline: new Date("2026-04-21"),
      priority: "standard",
      departments: ["Infrastructure", "Transport"],
      description: "All reports, cost estimates, and internal correspondence relating to the Featherston Street upgrade project, including contractor negotiations, budget overruns, and any cost-benefit analyses prepared since January 2025.",
      status: "in-review",
      documentCount: 0,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-002",
      reference: "LGOIMA-2026-011",
      requesterName: "R. Te Huia (Solicitor)",
      requesterType: "Legal",
      dateReceived: new Date("2026-03-10"),
      deadline: new Date("2026-04-07"),
      priority: "urgent",
      departments: ["Planning & Strategic Development", "Legal & Governance"],
      description: "Documents relating to resource consent RC-2025-0934 for the proposed mixed-use development at 123 Broadway Avenue, including officer reports, peer reviews, submitter details, and hearing panel recommendations.",
      status: "in-review",
      documentCount: 0,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-003",
      reference: "LGOIMA-2026-018",
      requesterName: "Rangitāne o Manawatū",
      requesterType: "Organisation",
      dateReceived: new Date("2026-04-01"),
      deadline: new Date("2026-04-29"),
      priority: "standard",
      departments: ["Environmental Compliance", "Parks & Property"],
      description: "All environmental monitoring data, compliance reports, and iwi engagement records relating to the Manawatū River water quality programme and the council's freshwater management obligations under the NPS-FM, from 2024 to present.",
      status: "draft",
      documentCount: 0,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-004",
      reference: "LGOIMA-2026-009",
      requesterName: "NZ Herald",
      requesterType: "Media",
      dateReceived: new Date("2026-03-05"),
      deadline: new Date("2026-04-02"),
      priority: "urgent",
      departments: ["Finance & Corporate", "Legal & Governance"],
      description: "All documents relating to the CEO's performance review and remuneration benchmarking exercise conducted in late 2025, including consultancy reports, council deliberations in public-excluded sessions, and any related correspondence.",
      status: "senior-review",
      documentCount: 0,
      reviewedCount: 0,
      redactionCount: 0,
    },
    {
      id: "req-005",
      reference: "LGOIMA-2026-021",
      requesterName: "P. Anderson",
      requesterType: "Individual",
      dateReceived: new Date("2026-04-07"),
      deadline: new Date("2026-05-05"),
      priority: "standard",
      departments: ["Community Services", "Finance & Corporate"],
      description: "Funding applications, assessment criteria, and allocation decisions for community grants awarded under the Creative Communities and Community Development Fund programmes in the 2025/26 financial year.",
      status: "draft",
      documentCount: 0,
      reviewedCount: 0,
      redactionCount: 0,
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

  // --- Audit entries (lightweight — case creation only) ---
  const auditEntries = [
    { id: "aud-001", timestamp: new Date("2026-03-24T09:00:00"), userId: "u-001", userName: "Sarah Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-014", caseId: "req-001", detail: "Requester: Manawatū Standard (Media), Deadline: 21 Apr 2026" },
    { id: "aud-002", timestamp: new Date("2026-03-10T08:30:00"), userId: "u-001", userName: "Sarah Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case (urgent)", target: "LGOIMA-2026-011", caseId: "req-002", detail: "Requester: R. Te Huia (Solicitor), Priority: urgent, Deadline: 7 Apr 2026" },
    { id: "aud-003", timestamp: new Date("2026-04-01T10:15:00"), userId: "u-002", userName: "David Kowalski", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-018", caseId: "req-003", detail: "Requester: Rangitāne o Manawatū, Deadline: 29 Apr 2026" },
    { id: "aud-004", timestamp: new Date("2026-03-05T08:00:00"), userId: "u-001", userName: "Sarah Mitchell", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case (urgent)", target: "LGOIMA-2026-009", caseId: "req-004", detail: "Requester: NZ Herald (Media), Priority: urgent, Deadline: 2 Apr 2026" },
    { id: "aud-005", timestamp: new Date("2026-04-07T14:00:00"), userId: "u-002", userName: "David Kowalski", userRole: "Request Manager", type: "admin", description: "Created LGOIMA request case", target: "LGOIMA-2026-021", caseId: "req-005", detail: "Requester: P. Anderson, Deadline: 5 May 2026" },
  ];

  for (const a of auditEntries) {
    await prisma.auditEntry.upsert({
      where: { id: a.id },
      update: a,
      create: a,
    });
  }
  console.log(`  ✓ ${auditEntries.length} audit entries`);

  // --- Pipeline milestones for req-001 (Featherston St — most advanced case) ---
  const milestones = [
    { id: "ms-001", caseId: "req-001", stage: "collection", label: "Document Collection", targetDate: new Date("2026-03-27"), completedAt: new Date("2026-03-25") as Date | null, sortOrder: 1 },
    { id: "ms-002", caseId: "req-001", stage: "processing", label: "AI Processing", targetDate: new Date("2026-03-28"), completedAt: new Date("2026-03-25") as Date | null, sortOrder: 2 },
    { id: "ms-003", caseId: "req-001", stage: "initial-review", label: "Initial Review", targetDate: new Date("2026-04-08"), completedAt: null, sortOrder: 3 },
    { id: "ms-004", caseId: "req-001", stage: "senior-review", label: "Senior Review", targetDate: new Date("2026-04-14"), completedAt: null, sortOrder: 4 },
    { id: "ms-005", caseId: "req-001", stage: "final-approval", label: "Final Approval", targetDate: new Date("2026-04-17"), completedAt: null, sortOrder: 5 },
    { id: "ms-006", caseId: "req-001", stage: "release", label: "Release", targetDate: new Date("2026-04-21"), completedAt: null, sortOrder: 6 },
  ];

  for (const m of milestones) {
    await prisma.caseMilestone.upsert({
      where: { id: m.id },
      update: m,
      create: m,
    });
  }
  console.log(`  ✓ ${milestones.length} pipeline milestones (req-001)`);

  // --- Pipeline assignments for req-001 ---
  const pipelineAssignments = [
    { id: "pa-001", caseId: "req-001", milestoneId: "ms-001", type: "department", departmentId: "dept-001", assignedBy: "Sarah Mitchell" },
    { id: "pa-002", caseId: "req-001", milestoneId: "ms-001", type: "department", departmentId: "dept-008", assignedBy: "Sarah Mitchell" },
    { id: "pa-003", caseId: "req-001", milestoneId: "ms-003", type: "user", userId: "u-003", role: "reviewer", assignedBy: "Sarah Mitchell" },
    { id: "pa-004", caseId: "req-001", milestoneId: "ms-003", type: "user", userId: "u-004", role: "reviewer", assignedBy: "Sarah Mitchell" },
    { id: "pa-005", caseId: "req-001", milestoneId: "ms-004", type: "user", userId: "u-007", role: "senior-reviewer", assignedBy: "Sarah Mitchell" },
    { id: "pa-006", caseId: "req-001", milestoneId: "ms-005", type: "user", userId: "u-009", role: "final-approver", assignedBy: "Sarah Mitchell" },
  ];

  for (const a of pipelineAssignments) {
    await prisma.caseAssignment.upsert({
      where: { id: a.id },
      update: a,
      create: a,
    });
  }
  console.log(`  ✓ ${pipelineAssignments.length} pipeline assignments`);

  // --- Organisation identity: Palmerston North City Council ---
  await prisma.systemSetting.upsert({
    where: { key: "org_identity" },
    update: {
      value: {
        name: "Palmerston North City Council",
        maoriName: "Te Kaunihera o Papaioea",
        abbreviation: "PNCC",
        orgType: "City Council",
        address: "32 The Square, Palmerston North 4410",
        phone: "06 356 8199",
        email: "info@pncc.govt.nz",
        website: "https://www.pncc.govt.nz",
      } as InputJsonValue,
      updatedBy: "seed",
    },
    create: {
      key: "org_identity",
      value: {
        name: "Palmerston North City Council",
        maoriName: "Te Kaunihera o Papaioea",
        abbreviation: "PNCC",
        orgType: "City Council",
        address: "32 The Square, Palmerston North 4410",
        phone: "06 356 8199",
        email: "info@pncc.govt.nz",
        website: "https://www.pncc.govt.nz",
      } as InputJsonValue,
      updatedBy: "seed",
    },
  });
  console.log("  ✓ Organisation identity: Palmerston North City Council");

  // --- Organisation signatory ---
  await prisma.systemSetting.upsert({
    where: { key: "org_signatory" },
    update: {
      value: {
        name: "Sarah Mitchell",
        title: "Information & Privacy Officer",
        department: "Legal & Governance",
      } as InputJsonValue,
      updatedBy: "seed",
    },
    create: {
      key: "org_signatory",
      value: {
        name: "Sarah Mitchell",
        title: "Information & Privacy Officer",
        department: "Legal & Governance",
      } as InputJsonValue,
      updatedBy: "seed",
    },
  });
  console.log("  ✓ Organisation signatory");

  // --- Activation: mark instance as activated ---
  await prisma.systemSetting.upsert({
    where: { key: "activation_status" },
    update: {
      value: { activated: true, activatedAt: new Date().toISOString(), activatedBy: "seed" } as InputJsonValue,
    },
    create: {
      key: "activation_status",
      value: { activated: true, activatedAt: new Date().toISOString(), activatedBy: "seed" } as InputJsonValue,
      updatedBy: "seed",
    },
  });
  console.log("  ✓ Instance activated");

  console.log("\n✅ Seed complete! Ready for document uploads.");
  console.log("\nLogin options:");
  console.log("  SSO:         eugene@datasing.com (Azure AD)");
  console.log("  Credentials: any @pncc.govt.nz user, password: \"password\"");
  console.log("  e.g.         s.mitchell@pncc.govt.nz / password");
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
