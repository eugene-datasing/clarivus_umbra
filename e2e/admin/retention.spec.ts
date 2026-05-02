/**
 * Phase 6 admin retention flow — e2e.
 *
 * Phase 10 placeholder: spec covers the live admin Trash + Purge Now
 * flow. `test.fixme()`'d until Phase 11 deploys a populated demo
 * environment where an admin can soft-delete a batch through the UI
 * and observe the worker complete the cascade.
 */
import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../fixtures/test-data";

test.describe.fixme("Admin retention page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USERS.admin.email);
    await page.getByLabel(/password/i).fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\//);
  });

  test("renders the retention config form, trash table, and purge history", async ({
    page,
  }) => {
    await page.goto("/admin/retention");
    await expect(
      page.getByRole("heading", { name: /retention/i }),
    ).toBeVisible();
    await expect(page.getByText(/Retention Configuration/i)).toBeVisible();
    await expect(page.getByText(/Trash/i)).toBeVisible();
    await expect(page.getByText(/Purge History/i)).toBeVisible();
  });

  test("admin can soft-delete a batch and see it in Trash", async ({ page }) => {
    // Phase 11 will seed a deletable batch; the spec will:
    //   1. navigate to /batches
    //   2. click Delete on the seeded batch
    //   3. confirm
    //   4. navigate to /admin/retention
    //   5. expect the batch's reference to appear in the Trash table
  });

  test("Restore moves a batch back from Trash", async ({ page }) => {
    // Pre-state: a soft-deleted batch is in Trash.
    //   1. click Restore on the row
    //   2. expect router.refresh to drop the row from Trash
  });

  test("Purge Now without skip-grace schedules the purge with the standard grace window", async ({
    page,
  }) => {
    // The button click should leave purgeScheduledAt unchanged from soft-delete time.
  });

  test("Purge Now with skip-grace requires a reason", async ({ page }) => {
    //   1. click Purge Now on a Trash row
    //   2. flip the "Skip grace" toggle
    //   3. expect Confirm Purge to be disabled until the reason textarea has content
    //   4. enter a reason → Confirm fires → purge job enqueued
  });

  test("cross-batch audit archive download produces a non-empty ZIP", async ({
    page,
  }) => {
    //   1. navigate to /admin/settings → Backup tab
    //   2. click "Download Audit Archive (ZIP)"
    //   3. assert a ZIP download arrives (Content-Type: application/zip,
    //      non-empty body, includes verification-summary.json)
  });
});
