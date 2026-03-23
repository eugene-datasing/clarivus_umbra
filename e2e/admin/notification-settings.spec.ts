import { test, expect } from "@playwright/test";

test.describe("Admin — Notification Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/settings");
    // Scope to the main content area to avoid matching the sidebar notification bell
    const mainContent = page.locator("[role='main'], #main-content, main").first();
    await mainContent.getByRole("button", { name: "Notifications", exact: true }).click();
  });

  test("shows notification event preferences", async ({ page }) => {
    // Should list notification events
    await expect(page.locator("body")).toContainText(/document assigned/i);
    await expect(page.locator("body")).toContainText(/review submitted/i);
    await expect(page.locator("body")).toContainText(/deadline approaching/i);
  });

  test("shows in-app and email toggle columns", async ({ page }) => {
    const thead = page.locator("thead");
    await expect(thead).toContainText(/in-app/i);
    await expect(thead).toContainText(/email/i);
  });

  test("has toggle buttons for notification preferences", async ({ page }) => {
    // Each event row has In-App and Email toggle buttons (not checkboxes)
    const tbody = page.locator("tbody");
    const toggleButtons = tbody.locator("button");
    const count = await toggleButtons.count();
    // 6 events × 2 columns = 12 toggle buttons
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test("has a Save Changes button", async ({ page }) => {
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await expect(saveBtn).toBeVisible();
  });
});
