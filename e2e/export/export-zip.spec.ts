/**
 * Phase 7 export package — e2e layout assertion.
 *
 * Phase 10 placeholder: covers the single-ZIP export and asserts
 * the layout produced by `lib/pipeline/export.ts`. `test.fixme()`'d
 * until Phase 11 deploys a populated demo environment with at least
 * one signed-off batch ready for export.
 */
import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../fixtures/test-data";

test.describe.fixme("Export ZIP layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USERS.admin.email);
    await page.getByLabel(/password/i).fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\//);
  });

  test("Generate Export Package produces a ZIP with the expected entries", async ({
    page,
  }) => {
    // Pre-state: a batch with at least one signed-off document.
    //   1. navigate to /batches/{id}/export
    //   2. select all signed-off documents
    //   3. click Generate Export Package
    //   4. wait for completion (poll /api/export/{batchId}/{exportId}/status)
    //   5. download the ZIP via the Download Package button
    //   6. unzip in-memory and assert the contents:
    //        redacted/{name}.pdf       (one per document)
    //        redaction-schedule.pdf
    //        audit-timeline.pdf
    //        audit-log.pdf
    //        audit-log.csv
    //        verification-report.txt
    //        manifest.json
    //   7. open redaction-schedule.pdf and assert it does NOT contain
    //      any of the redacted text strings (Amendment A4 no-leakage).
  });

  test("Generate is disabled when no documents are selected", async ({ page }) => {
    // Empty selection → button absent + helper hint visible.
    expect(true).toBe(true);
  });

  test("Generate is gated when batch has unreviewed documents", async ({
    page,
  }) => {
    // Documents in `pending` / `processing` / `ready` / `error` should
    // be marked Blocked in the readiness table; the route should refuse
    // with a clear error if a Blocked doc somehow gets included.
  });
});
