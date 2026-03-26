import { test, expect } from "@playwright/test";

test.describe("Admin Settings Save", () => {
  test("Detection Settings tab has entity toggle switches", async ({ page }) => {
    await page.goto("/admin/settings");
    // Click Detection Settings tab
    const detectionTab = page.getByRole("button", { name: "Detection Settings", exact: true });
    await detectionTab.click();
    // Should show toggle switches for entity types
    await expect(page.locator("body")).toContainText(/personal.*name|phone|email/i);
    // Toggle buttons should be visible
    const toggles = page.locator("button").filter({ has: page.locator("svg") });
    const count = await toggles.count();
    expect(count).toBeGreaterThan(0);
  });

  test("Detection Settings shows Save Changes button", async ({ page }) => {
    await page.goto("/admin/settings");
    const detectionTab = page.getByRole("button", { name: "Detection Settings", exact: true });
    await detectionTab.click();
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await expect(saveBtn).toBeVisible();
  });

  test("Detection Settings save shows success feedback", async ({ page }) => {
    await page.goto("/admin/settings");
    const detectionTab = page.getByRole("button", { name: "Detection Settings", exact: true });
    await detectionTab.click();
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await saveBtn.click();
    // Button should change to "Saved" state
    await expect(page.locator("body")).toContainText(/saved/i, { timeout: 10_000 });
  });

  test("Workflow tab has review stage checkboxes", async ({ page }) => {
    await page.goto("/admin/settings");
    const workflowTab = page.getByRole("button", { name: "Workflow", exact: true });
    await workflowTab.click();
    await expect(page.locator("body")).toContainText(/reviewer stage/i);
    await expect(page.locator("body")).toContainText(/senior review/i);
  });

  test("Workflow tab has deadline warning inputs", async ({ page }) => {
    await page.goto("/admin/settings");
    const workflowTab = page.getByRole("button", { name: "Workflow", exact: true });
    await workflowTab.click();
    await expect(page.locator("body")).toContainText(/amber warning|red warning/i);
  });

  test("Workflow tab save shows success feedback", async ({ page }) => {
    await page.goto("/admin/settings");
    const workflowTab = page.getByRole("button", { name: "Workflow", exact: true });
    await workflowTab.click();
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await saveBtn.click();
    await expect(page.locator("body")).toContainText(/saved/i, { timeout: 10_000 });
  });

  test("Notifications tab has in-app and email toggle columns", async ({ page }) => {
    await page.goto("/admin/settings");
    const notifsTab = page.locator("[role='main'], #main-content, main").first()
      .getByRole("button", { name: "Notifications", exact: true });
    await notifsTab.click();
    await expect(page.locator("body")).toContainText(/in-app/i);
    await expect(page.locator("body")).toContainText(/email/i);
  });

  test("Notifications tab save shows success feedback", async ({ page }) => {
    await page.goto("/admin/settings");
    const notifsTab = page.locator("[role='main'], #main-content, main").first()
      .getByRole("button", { name: "Notifications", exact: true });
    await notifsTab.click();
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await saveBtn.click();
    await expect(page.locator("body")).toContainText(/saved/i, { timeout: 10_000 });
  });

  test("Organisation tab shows edit in setup wizard link", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.locator("body")).toContainText(/edit in setup wizard/i);
  });

  test("System Health tab shows service statuses", async ({ page }) => {
    await page.goto("/admin/settings");
    const healthTab = page.getByRole("button", { name: "System Health", exact: true });
    await healthTab.click();
    await expect(page.locator("body")).toContainText(/operational|azure/i);
    await expect(page.locator("body")).toContainText(/storage usage/i);
  });
});
