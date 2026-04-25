import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Bulk Review", () => {
  const bulkReviewUrl = `/requests/${SEED.cases.featherstonStreet.id}/bulk-review`;

  test("renders the bulk review page with heading", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    await expect(page.locator("body")).toContainText(/bulk.*review/i);
  });

  test("lists detections from case documents", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // The seed data includes "John Smith" as a detection
    await expect(page.locator("body")).toContainText("John Smith");
  });

  test("shows pending detection count", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // The confidence threshold section shows "N pending detections"
    await expect(page.locator("body")).toContainText(/pending detection/i);
  });

  test("shows entity action buttons (Apply to All / Review Each / Skip)", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Each entity group has Apply to All, Apply to All Similar, Review Each, Skip
    const actionBtn = page
      .getByRole("button", { name: /apply to all/i })
      .first();
    await expect(actionBtn).toBeVisible({ timeout: 10_000 });
  });

  test("shows confidence percentages for detections", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    await expect(page.locator("body")).toContainText(/%/);
  });

  test("shows document source for each detection", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Each detection should reference which document it came from
    await expect(page.locator("body")).toContainText(/council_report|\.pdf|\.docx|\.eml/i);
  });
});
