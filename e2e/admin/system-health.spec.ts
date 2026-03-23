import { test, expect } from "@playwright/test";

test.describe("Admin — System Health", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/settings");
    await page.getByRole("button", { name: "System Health", exact: true }).click();
  });

  test("shows service status cards", async ({ page }) => {
    // Should show Azure service statuses
    await expect(page.locator("body")).toContainText(/blob storage|cosmos|ai search|openai/i);
  });

  test("shows service health indicators", async ({ page }) => {
    await expect(page.locator("body")).toContainText(
      /healthy|operational|degraded|offline|unknown/i,
    );
  });

  test("shows storage usage information", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/storage|gb/i);
  });

  test("shows Veil version information", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/version|v\d+\.\d+/i);
  });

  test("shows response time metrics", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/response|latency|ms/i);
  });
});
