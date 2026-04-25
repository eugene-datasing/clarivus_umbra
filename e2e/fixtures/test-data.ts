/**
 * Shared test data constants used across E2E specs.
 *
 * Auth credentials must match users seeded via the global-setup script
 * (which writes the e2e-* users with bcrypt-hashed passwords directly
 * to the DB). The case / document / detection IDs match the PNCC demo
 * seed used on dev — Slice D1 (April 2026) replaced the old
 * `coastalWalkway` fixture set with the live PNCC seed so e2e specs
 * can run against the same DB the reviewer demo runs against.
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

/**
 * Stable IDs from the PNCC demo seed (`prisma/seed.ts`). The mnemonic
 * names describe each case's content so spec assertions read clearly.
 *
 * Compile-time forcing function — renaming the old `coastalWalkway` /
 * `devonStreet` etc keys breaks every consumer at typecheck, so the
 * Slice D1 migration is mechanical: each broken site gets the right
 * PNCC equivalent surfaced by the type error.
 */
export const SEED = {
  cases: {
    /** req-001 — Featherston Street upgrade (Manawatū Standard, in-review). */
    featherstonStreet: { id: "req-001", reference: "LGOIMA-2026-014" },
    /** req-002 — Resource consent RC-2025-0934 (Solicitor, in-review). */
    resourceConsent: { id: "req-002", reference: "LGOIMA-2026-011" },
    /** req-003 — Manawatū River water quality (Rangitāne o Manawatū, draft). */
    waterQuality: { id: "req-003", reference: "LGOIMA-2026-018" },
    /** req-004 — CEO performance review (NZ Herald, senior-review). */
    ceoReview: { id: "req-004", reference: "LGOIMA-2026-009" },
    /** req-005 — Community grants (P. Anderson, in-review). */
    communityGrants: { id: "req-005", reference: "LGOIMA-2026-021" },
  },
  documents: {
    /**
     * req-001 / DOCX / 6 pages / 58 detections — text-selectable canonical.
     * Anchor doc for review-flow specs.
     */
    mainCaseFile: {
      id: "cmo5enehy00002z6cicgod7np",
      caseId: "req-001",
      name: "04_main_case_file_long.docx",
    },
    /**
     * req-002 / image-only PDF — `canonicalPdfTextSelectable = false`.
     * Use to exercise the Option C fallback (PDF view routes to HTML).
     */
    scannedSim: {
      id: "cmoc936xg00005p061gn1w35e",
      caseId: "req-002",
      name: "Scanned-Simulation-For-Option-C.pdf",
    },
    /**
     * req-005 / native PDF / 2 pages / signed-off — useful for
     * version-compare and audit-trail specs that need a non-draft doc.
     */
    formalReport: {
      id: "cmo3zc44b001o6c6cnk5bud97",
      caseId: "req-005",
      name: "07_formal_report.pdf",
    },
    /**
     * req-005 / null `canonicalPdfPath` — backfill safety filter excluded
     * this row. Use to verify "flag=pdf + null canonical → HTML branch"
     * routing behaviour.
     */
    employmentAgreement: {
      id: "cmo3xr66j00096c6cg7lns5g1",
      caseId: "req-005",
      name: "Employment Agreement - Zhang Liyong (1)[62].pdf",
    },
  },
  /**
   * Sample detection types known to be present on `mainCaseFile`. Prefer
   * count-based or type-based assertions over specific-text assertions;
   * specific texts here are kept for the rare case a spec genuinely
   * needs to verify a particular detection appears (and even then,
   * regex-matched types like phone / nhi / bank-account are more stable
   * than AI-inferred narrative summaries).
   */
  detectionTypes: {
    onMainCaseFile: ["phone", "address", "nhi", "email-addr", "personal-name", "bank-account"] as const,
  },
} as const;
