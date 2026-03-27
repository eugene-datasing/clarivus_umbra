import { test, expect } from "@playwright/test";

test.describe("RBAC — Role-Based Access Control", () => {
  test.describe("admin role", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("can access the admin settings page", async ({ page }) => {
      await page.goto("/admin/settings");
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("body")).toContainText(/settings|organisation/i);
    });

    test("can access the custom rules page", async ({ page }) => {
      await page.goto("/admin/rules");
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("body")).toContainText(/custom.*rules|detection rules/i);
    });

    test("can access the AI governance page", async ({ page }) => {
      await page.goto("/admin/ai-governance");
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("body")).toContainText(/governance|model|accuracy/i);
    });

    test("can access the reports page", async ({ page }) => {
      await page.goto("/reports");
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("body")).toContainText(/reports|analytics/i);
    });

    test("sidebar shows admin navigation links", async ({ page }) => {
      await page.goto("/");
      const nav = page.locator("nav");
      await expect(nav.getByText("Custom Rules")).toBeVisible();
      await expect(nav.getByText("AI Governance")).toBeVisible();
      await expect(nav.getByText("Reports")).toBeVisible();
      await expect(nav.getByText("Settings")).toBeVisible();
    });
  });

  test.describe("reviewer role", () => {
    test.use({ storageState: "e2e/.auth/reviewer.json" });

    test("is redirected away from /admin/settings", async ({ page }) => {
      await page.goto("/admin/settings");
      await expect(page).toHaveURL("/");
    });

    test("is redirected away from /admin/rules", async ({ page }) => {
      await page.goto("/admin/rules");
      await expect(page).toHaveURL("/");
    });

    test("can still access the dashboard", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("body")).toContainText(/dashboard|active cases/i);
    });

    test("can access the review queue", async ({ page }) => {
      await page.goto("/queue");
      await expect(page.locator("body")).toContainText(/processing dashboard|my review queue/i);
    });

    test("sidebar does not show admin links", async ({ page }) => {
      await page.goto("/");
      const nav = page.locator('nav[aria-label="Main navigation"]');
      const navText = await nav.textContent();
      expect(/settings/i.test(navText ?? "")).toBeFalsy();
    });
  });
});
