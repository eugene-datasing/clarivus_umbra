import { test, expect } from "@playwright/test";

test.describe("My Review Queue", () => {
  test("renders the queue page with processing dashboard", async ({ page }) => {
    await page.goto("/queue");
    // The page heading is "Processing Dashboard" with "My Review Queue" below
    await expect(page.locator("body")).toContainText(/processing dashboard/i);
    await expect(page.locator("body")).toContainText(/my review queue/i);
  });

  test("shows document count in the subtitle", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.locator("body")).toContainText(/documents? awaiting/i);
  });

  test("groups documents by case with reference links", async ({ page }) => {
    await page.goto("/queue");
    // Queue page shows case references as links (screenshot confirms docs exist)
    const refLink = page.locator("a").filter({ hasText: /LGOIMA-/ }).first();
    await expect(refLink).toBeVisible();
  });

  test("shows deadline indicators for queued cases", async ({ page }) => {
    await page.goto("/queue");
    // Should show deadline info (e.g. "8d remaining", "11d remaining")
    await expect(page.locator("body")).toContainText(/\d+d remaining/i);
  });

  test("shows Start Review buttons for queued documents", async ({ page }) => {
    await page.goto("/queue");
    const startBtn = page.getByRole("link", { name: /start review/i }).first();
    await expect(startBtn).toBeVisible();
  });

  test("shows processing stats at top of page", async ({ page }) => {
    await page.goto("/queue");
    // The processing dashboard shows Processed/Pending/Failed counts
    await expect(page.locator("body")).toContainText(/processed/i);
    await expect(page.locator("body")).toContainText(/pending/i);
  });

  test("shows detection counts and confidence for queued documents", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.locator("body")).toContainText(/\d+ detections?/i);
    await expect(page.locator("body")).toContainText(/avg confidence/i);
  });
});
