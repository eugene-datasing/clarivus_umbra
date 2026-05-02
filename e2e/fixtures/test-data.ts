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
 * The `cases` and `documents` keys below are deprecated stubs that
 * preserve compile-time references in the e2e suite while every spec
 * that consumed them is `test.fixme()`'d pending Phase 11. Phase 11
 * will replace these with real Ministry of Demo content fixtures.
 */
export const SEED = {
  batches: {
    qOnePublicSubmissions: { reference: "BATCH-2026-001" },
    consultationResponses: { reference: "BATCH-2026-002" },
    workingGroupCorrespondence: { reference: "BATCH-2026-003" },
  },

  /** @deprecated Phase 11 will replace with real Ministry of Demo content fixtures. */
  cases: {
    /** @deprecated stub — spec is fixme'd. */
    featherstonStreet: { id: "stub-batch-1", reference: "BATCH-STUB-001" },
    /** @deprecated stub — spec is fixme'd. */
    resourceConsent: { id: "stub-batch-2", reference: "BATCH-STUB-002" },
    /** @deprecated stub — spec is fixme'd. */
    waterQuality: { id: "stub-batch-3", reference: "BATCH-STUB-003" },
    /** @deprecated stub — spec is fixme'd. */
    ceoReview: { id: "stub-batch-4", reference: "BATCH-STUB-004" },
    /** @deprecated stub — spec is fixme'd. */
    communityGrants: { id: "stub-batch-5", reference: "BATCH-STUB-005" },
  },

  /** @deprecated Phase 11 will replace with real Ministry of Demo content fixtures. */
  documents: {
    /** @deprecated stub — spec is fixme'd. */
    mainCaseFile: {
      id: "stub-doc-1",
      batchId: "stub-batch-1",
      name: "stub-document-1.pdf",
    },
    /** @deprecated stub — spec is fixme'd. */
    scannedSim: {
      id: "stub-doc-2",
      batchId: "stub-batch-2",
      name: "stub-document-2.pdf",
    },
    /** @deprecated stub — spec is fixme'd. */
    formalReport: {
      id: "stub-doc-3",
      batchId: "stub-batch-5",
      name: "stub-document-3.pdf",
    },
    /** @deprecated stub — spec is fixme'd. */
    employmentAgreement: {
      id: "stub-doc-4",
      batchId: "stub-batch-5",
      name: "stub-document-4.pdf",
    },
  },

  /** @deprecated Phase 11 will replace with real Ministry of Demo content fixtures. */
  detectionTypes: {
    onMainCaseFile: [
      "phone",
      "address",
      "nhi",
      "email-addr",
      "personal-name",
      "bank-account",
    ] as const,
  },
} as const;
