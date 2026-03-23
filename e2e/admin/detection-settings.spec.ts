import { test, expect } from "@playwright/test";

test.describe("Admin — Detection Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/settings");
    await page.getByRole("button", { name: "Detection Settings", exact: true }).click();
  });

  test("shows confidence threshold controls", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/confidence threshold/i);
    await expect(page.locator("body")).toContainText(/high/i);
    await expect(page.locator("body")).toContainText(/medium/i);
    await expect(page.locator("body")).toContainText(/low/i);
  });

  test("shows entity detection type toggles", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/personal names/i);
    await expect(page.locator("body")).toContainText(/commercial sensitivity/i);
  });

  test("shows pattern library section", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/pattern library/i);
  });

  test("has a Save Changes button", async ({ page }) => {
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await expect(saveBtn).toBeVisible();
  });

  test("shows confidence percentage values", async ({ page }) => {
    // Confidence thresholds should show percentage values
    await expect(page.locator("body")).toContainText(/%/);
  });
});
