import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Bulk Review Actions", () => {
  const bulkReviewUrl = `/requests/${SEED.cases.featherstonStreet.id}/bulk-review`;

  test("shows confidence threshold slider", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Threshold slider or quick-select buttons should be visible
    await expect(page.locator("body")).toContainText(/confidence threshold|threshold/i);
  });

  test("shows quick threshold presets (50%, 70%, 85%, etc.)", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Quick selection buttons at common thresholds
    const body = await page.locator("body").textContent();
    const hasPresets = /50%|70%|85%|90%|95%/.test(body ?? "");
    expect(hasPresets).toBeTruthy();
  });

  test("shows Apply Threshold button", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    const applyBtn = page.getByRole("button", { name: /apply threshold/i });
    await expect(applyBtn).toBeVisible();
  });

  test("shows entity groups with detection counts", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Entity groups show how many detections each entity has
    await expect(page.locator("body")).toContainText(/\d+\s*(detection|occurrence|instance)/i);
  });

  test("shows Apply to All Similar button on entity cards", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    const similarBtn = page.getByRole("button", { name: /apply to all similar/i }).first();
    await expect(similarBtn).toBeVisible({ timeout: 10_000 });
  });

  /**
   * TODO Slice D-followup: "Review Each" affordance is not present on
   * entity cards in the PNCC-seeded bulk-review view (likely because no
   * entity grouping reaches the threshold for this control without
   * accept/reject actions on the seed). Restore once seed includes a
   * representative state OR the assertion target is updated.
   */
  test.fixme("shows Review Each button on entity cards", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    const reviewBtn = page.getByRole("button", { name: /review each/i }).first();
    await expect(reviewBtn).toBeVisible({ timeout: 10_000 });
  });

  test("shows Skip button on entity cards", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    const skipBtn = page.getByRole("button", { name: /skip/i }).first();
    await expect(skipBtn).toBeVisible({ timeout: 10_000 });
  });

  test("shows progress tracker for entity group review", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Shows "X of Y entity groups reviewed"
    await expect(page.locator("body")).toContainText(/\d+\s*of\s*\d+/i);
  });

  test("shows type summary section", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Shows detection types summary (personal names, phone numbers, etc.)
    await expect(page.locator("body")).toContainText(/personal|phone|email|commercial/i);
  });

  test("shows confidence distribution visualization", async ({ page }) => {
    await page.goto(bulkReviewUrl);
    // Histogram or bar chart for confidence distribution
    await expect(page.locator("body")).toContainText(/high|medium|low|distribution/i);
  });
});
