/**
 * Phase 12.6c — contract test pinning the EXPORT_DOCUMENT_STATUSES
 * constant to BOTH the export pipeline and the export-runner.
 *
 * The pre-fix bug (Phase 12.2 → 12.6b) had two files independently
 * encoding "which document statuses are exportable":
 *   - export.ts:148 used a hard-coded ["signed-off", "reviewed"]
 *     filter on the redaction loop's findMany.
 *   - export-runner.ts used a hard-coded blocked list, the comments
 *     said the allow-list included auto-redacted, but export.ts had
 *     never been updated.
 *
 * Result: auto-redacted batches passed the runner's check, then the
 * redaction loop processed zero docs and produced an empty ZIP.
 *
 * This test guards against the same drift recurring. It loudly
 * fails with a clear "EXPORT_DOCUMENT_STATUSES drift detected"
 * message if either consumer is edited without the constant being
 * the single source of truth.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { EXPORT_DOCUMENT_STATUSES } from "../export-document-statuses";

const exportSource = readFileSync(
  resolve(process.cwd(), "lib/pipeline/export.ts"),
  "utf-8",
);
const runnerSource = readFileSync(
  resolve(process.cwd(), "lib/pipeline/export-runner.ts"),
  "utf-8",
);

describe("EXPORT_DOCUMENT_STATUSES — contract", () => {
  it("includes auto-redacted (the regression target)", () => {
    expect(EXPORT_DOCUMENT_STATUSES).toContain("auto-redacted");
  });

  it("includes the four documented exportable terminal statuses", () => {
    for (const s of ["in-review", "reviewed", "signed-off", "auto-redacted"]) {
      expect(
        EXPORT_DOCUMENT_STATUSES,
        `EXPORT_DOCUMENT_STATUSES drift detected: missing "${s}". Update lib/pipeline/export-document-statuses.ts before adding consumers.`,
      ).toContain(s);
    }
  });

  it("export.ts imports the shared constant rather than hard-coding statuses", () => {
    expect(
      exportSource.includes(`from "./export-document-statuses"`) &&
        exportSource.includes("EXPORT_DOCUMENT_STATUSES"),
      "EXPORT_DOCUMENT_STATUSES drift detected: lib/pipeline/export.ts must import the shared constant. Do not hard-code status strings.",
    ).toBe(true);
  });

  it("export-runner.ts imports the shared constant rather than hard-coding statuses", () => {
    expect(
      runnerSource.includes(`from "./export-document-statuses"`) &&
        runnerSource.includes("EXPORT_DOCUMENT_STATUSES"),
      "EXPORT_DOCUMENT_STATUSES drift detected: lib/pipeline/export-runner.ts must import the shared constant. Do not hard-code status strings.",
    ).toBe(true);
  });

  it("export.ts does not hard-code the legacy ['signed-off', 'reviewed'] filter", () => {
    // Pre-fix this exact literal lived at export.ts:148 and excluded
    // auto-redacted. If a future change reintroduces it, fail loudly.
    expect(
      exportSource.includes(`["signed-off", "reviewed"]`) ||
        exportSource.includes(`['signed-off', 'reviewed']`),
      "EXPORT_DOCUMENT_STATUSES drift detected: export.ts has reintroduced the pre-12.6c hard-coded status filter. Use the shared constant.",
    ).toBe(false);
  });

  it("export-runner.ts does not hard-code the legacy ['pending', 'processing', 'ready', 'error'] blocked list", () => {
    // Pre-fix this lived at export-runner.ts:64. The runner now
    // expresses the rule as "anything not in EXPORT_DOCUMENT_STATUSES";
    // reintroducing the deny-list literal would re-fork the contract.
    expect(
      runnerSource.includes(`["pending", "processing", "ready", "error"]`) ||
        runnerSource.includes(`['pending', 'processing', 'ready', 'error']`),
      "EXPORT_DOCUMENT_STATUSES drift detected: export-runner.ts has reintroduced the pre-12.6c hard-coded blocked list. Use the shared constant.",
    ).toBe(false);
  });
});
