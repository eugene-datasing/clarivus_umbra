import { test, expect } from "@playwright/test";

test.describe("Admin Settings", () => {
  test("renders the admin settings page", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.locator("body")).toContainText(/settings|admin|configuration|backup/i);
  });

  test("shows backup/restore options", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.locator("body")).toContainText(/backup|restore/i);
  });
});
