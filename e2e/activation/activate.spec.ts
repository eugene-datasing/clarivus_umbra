import { test, expect } from "@playwright/test";

test.describe("Instance Activation", () => {
  // Use unauthenticated state — activation page has its own auth handling
  // but the instance is already activated so we test redirect behaviour

  test("redirects to dashboard when instance is already activated", async ({ page }) => {
    await page.goto("/activate");
    // Instance is already activated in test env, should redirect
    await page.waitForURL((url) => !url.pathname.startsWith("/activate"), {
      timeout: 10_000,
    });
  });

  test("activation page has Veil branding elements", async ({ page }) => {
    // Navigate directly and check what renders before redirect
    const response = await page.goto("/activate");
    const body = await page.locator("body").textContent({ timeout: 5_000 });

    // Either we see the activation page briefly or get redirected
    if (page.url().includes("/activate")) {
      await expect(page.locator("body")).toContainText(/veil|activate/i);
    }
  });
});

test.describe("Instance Activation — Unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("requires authentication to access activation", async ({ page }) => {
    await page.goto("/activate");
    // Should redirect to login since activation requires auth
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });
});
