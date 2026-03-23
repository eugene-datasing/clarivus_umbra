import { test, expect } from "@playwright/test";

test.describe("Admin — Integrations", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/settings");
    const tab = page.getByRole("button", { name: /integration/i }).or(
      page.getByText("Integrations"),
    );
    await tab.click();
  });

  test("shows Microsoft 365 integration card", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/microsoft 365|m365/i);
  });

  test("shows Records Management integration card", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/records management/i);
  });

  test("shows eDiscovery integration card", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/ediscovery/i);
  });

  test("shows connection status for integrations", async ({ page }) => {
    // Each integration should show a status (connected, not configured, etc.)
    await expect(page.locator("body")).toContainText(
      /connected|not configured|disconnected|pending/i,
    );
  });

  test("shows provider information or setup guidance", async ({ page }) => {
    // Should show either provider info (when connected) or setup instructions
    await expect(page.locator("body")).toContainText(
      /provider|setup|configure|environment/i,
    );
  });
});
