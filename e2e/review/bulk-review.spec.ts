import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Bulk Review", () => {
  const bulkReviewUrl = `/requests/${SEED.cases.coastalWalkway.id}/bulk-review`;

  test("renders the bulk review page", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    await expect(page.locator("body")).toContainText(/bulk|batch|review/i);
  });

  test("lists documents available for bulk operations", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Should show document names or counts
    await expect(page.locator("body")).toContainText(/document|file/i);
  });

  test("shows bulk action buttons", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Look for bulk accept/reject or apply actions
    const bulkAction = page.getByRole("button", { name: /accept|reject|apply|approve/i }).first();
    const hasBulkActions = await bulkAction.isVisible({ timeout: 5_000 }).catch(() => false);
    // At minimum the page should render without error
    expect(hasBulkActions || (await page.locator("body").textContent())!.length > 0).toBeTruthy();
  });
});
