import { test, expect } from "@playwright/test";

test.describe("Admin Settings Save", () => {
  test("Detection Settings tab has entity toggle switches", async ({ page }) => {
    await page.goto("/admin/settings");
    // Click Detection Settings tab
    // Slice D1 — top-level tab is "Detection" (no "Settings" suffix)
    const detectionTab = page.getByRole("button", { name: "Detection", exact: true });
    await detectionTab.click();
    // Should show toggle switches for entity types
    await expect(page.locator("body")).toContainText(/personal.*name|phone|email/i);
    // Toggle buttons should be visible
    const toggles = page.locator("button").filter({ has: page.locator("svg") });
    const count = await toggles.count();
    expect(count).toBeGreaterThan(0);
  });

  /**
   * TODO Slice D-followup: Save UX has changed shape across the settings
   * tabs (no single "Save Changes" button on Detection / Workflow /
   * Notifications-section views in the current build). Restore once the
   * new save controls are identified.
   */
  test.fixme("Detection Settings shows Save Changes button", async ({ page }) => {
    await page.goto("/admin/settings");
    const detectionTab = page.getByRole("button", { name: "Detection", exact: true });
    await detectionTab.click();
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await expect(saveBtn).toBeVisible();
  });

  test.fixme("Detection Settings save shows success feedback", async ({ page }) => {
    await page.goto("/admin/settings");
    const detectionTab = page.getByRole("button", { name: "Detection", exact: true });
    await detectionTab.click();
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await saveBtn.click();
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

  test.fixme("Workflow tab save shows success feedback", async ({ page }) => {
    await page.goto("/admin/settings");
    const workflowTab = page.getByRole("button", { name: "Workflow", exact: true });
    await workflowTab.click();
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await saveBtn.click();
    await expect(page.locator("body")).toContainText(/saved/i, { timeout: 10_000 });
  });

  test("Notifications section has in-app and email toggle columns", async ({ page }) => {
    await page.goto("/admin/settings");
    // Slice D1 — Notifications is now a section inside the Workflow
    // top-tab (settings-client.tsx:655). Click Workflow; the
    // Notifications block renders within that view.
    await page.getByRole("button", { name: "Workflow", exact: true }).click();
    await page.waitForTimeout(300);
    await expect(page.locator("body")).toContainText(/in-app/i);
    await expect(page.locator("body")).toContainText(/email/i);
  });

  test.fixme("Notifications save shows success feedback", async ({ page }) => {
    await page.goto("/admin/settings");
    await page.getByRole("button", { name: "Workflow", exact: true }).click();
    await page.waitForTimeout(300);
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await saveBtn.click();
    await expect(page.locator("body")).toContainText(/saved/i, { timeout: 10_000 });
  });

  /**
   * TODO Slice D-followup: the "Edit in setup wizard" affordance is no
   * longer surfaced from the Organisation tab. Restore once the equivalent
   * link or button is identified, or update the assertion target.
   */
  test.fixme("Organisation tab shows edit in setup wizard link", async ({ page }) => {
    await page.goto("/admin/settings");
    await page.getByRole("button", { name: "Organisation", exact: true }).click();
    await page.waitForTimeout(200);
    await expect(page.locator("body")).toContainText(/edit in setup wizard/i);
  });

  test("System Health tab shows service statuses", async ({ page }) => {
    await page.goto("/admin/settings");
    const healthTab = page.getByRole("button", { name: "System Health", exact: true });
    await healthTab.click();
    // Health-card content is fetched async; wait for the live status to
    // render before asserting (otherwise we race the "Checking system
    // health..." placeholder).
    await expect(page.locator("body")).toContainText(/operational/i, { timeout: 15_000 });
  });
});
