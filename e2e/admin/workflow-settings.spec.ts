import { test, expect } from "@playwright/test";

test.describe("Admin — Workflow Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/settings");
    await page.getByRole("button", { name: "Workflow", exact: true }).click();
  });

  test("shows review stages configuration", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/review.*stage|reviewer stage/i);
  });

  test("shows required reviewer stage checkbox", async ({ page }) => {
    // Reviewer stage is always required
    await expect(page.locator("body")).toContainText(/reviewer/i);
    const checkbox = page.locator('input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible();
  });

  test("shows optional senior review and final approval toggles", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/senior review|final approval/i);
  });

  test("shows deadline warning threshold inputs", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/deadline|warning/i);
    await expect(page.locator("body")).toContainText(/amber|red/i);
  });

  test("has a Save Changes button", async ({ page }) => {
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await expect(saveBtn).toBeVisible();
  });
});
