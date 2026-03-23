/**
 * Shared test data constants used across E2E specs.
 *
 * These credentials must match users seeded via `prisma/seed.ts`
 * (which creates users without passwords). For E2E tests the
 * global-setup script creates credential-based test users with
 * bcrypt-hashed passwords directly in the DB.
 */

export const TEST_USERS = {
  admin: {
    email: "e2e-admin@veil-test.local",
    password: "VeilTest!2026",
    name: "E2E Admin",
    role: "admin",
    departmentId: "dept-001",
  },
  reviewer: {
    email: "e2e-reviewer@veil-test.local",
    password: "VeilTest!2026",
    name: "E2E Reviewer",
    role: "reviewer",
    departmentId: "dept-001",
  },
  seniorReviewer: {
    email: "e2e-senior@veil-test.local",
    password: "VeilTest!2026",
    name: "E2E Senior Reviewer",
    role: "senior-reviewer",
    departmentId: "dept-003",
  },
} as const;

/** IDs from prisma/seed.ts — stable for assertions */
export const SEED = {
  cases: {
    coastalWalkway: { id: "req-001", reference: "LGOIMA-2026-042" },
    devonStreet: { id: "req-002", reference: "LGOIMA-2026-039" },
    communityTrust: { id: "req-003", reference: "LGOIMA-2026-045" },
    bellBlock: { id: "req-004", reference: "LGOIMA-2026-038" },
    threeWaters: { id: "req-005", reference: "LGOIMA-2026-041" },
  },
  documents: {
    councilReport: { id: "doc-001", name: "Council_Report_Coastal_Walkway_v3.pdf" },
    budgetEstimate: { id: "doc-002", name: "Budget_Estimate_2025-26.xlsx" },
    emailThread: { id: "doc-003", name: "Email_Thread_Project_Manager_15Mar.eml" },
    engineeringAssessment: { id: "doc-005", name: "Engineering_Assessment_Stage2.pdf" },
  },
  detections: {
    johnSmith: { id: "det-001", text: "John Smith", type: "personal-name" },
    phone: { id: "det-002", text: "021 555 7823", type: "phone" },
    commercial: { id: "det-004", type: "commercial", status: "pending" },
    councillor: { id: "det-012", text: "Councillor M. Bridges", confidence: 42 },
  },
} as const;
