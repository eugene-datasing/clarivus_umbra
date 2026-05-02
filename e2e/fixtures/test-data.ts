/**
 * Shared test data constants used across e2e specs.
 *
 * Auth credentials must match users seeded via `e2e/seed-test-users.ts`
 * (which writes the e2e-* users with bcrypt-hashed passwords directly to
 * the DB). Phase 10 will reconcile the broader fixture set with the
 * post-Phase-9 surface; this file holds the minimum to compile.
 */

export const TEST_USERS = {
  admin: {
    email: "e2e-admin@umbra-test.local",
    password: "UmbraTest!2026",
    name: "E2E Admin",
    role: "admin",
  },
  reviewer: {
    email: "e2e-reviewer@umbra-test.local",
    password: "UmbraTest!2026",
    name: "E2E Reviewer",
    role: "reviewer",
  },
} as const;

/**
 * Stable IDs from the Umbra demo seed (`prisma/seed.ts`). Phase 9's
 * Ministry of Demo seed creates batches with auto-generated
 * `BATCH-{year}-NNN` references and no documents — admin uploads real
 * files at demo time.
 *
 * Phase 10 will add specific document/detection fixtures once the e2e
 * test suite is reconciled.
 */
export const SEED = {
  batches: {
    qOnePublicSubmissions: { reference: "BATCH-2026-001" },
    consultationResponses: { reference: "BATCH-2026-002" },
    workingGroupCorrespondence: { reference: "BATCH-2026-003" },
  },
} as const;
