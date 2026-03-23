import { test, expect } from "@playwright/test";

test.describe("RBAC — Role-Based Access Control", () => {
  test.describe("admin role", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("can access the admin settings page", async ({ page }) => {
      await page.goto("/admin/settings");
      await expect(page).not.toHaveURL(/\/login/);
      // Should see admin content, not a redirect to /
      await expect(page.locator("body")).not.toContainText("Sign In");
    });

    test("can access the custom rules page", async ({ page }) => {
      await page.goto("/admin/rules");
      await expect(page).not.toHaveURL(/\/login/);
    });

    test("can access the AI governance page", async ({ page }) => {
      await page.goto("/admin/ai-governance");
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe("reviewer role", () => {
    test.use({ storageState: "e2e/.auth/reviewer.json" });

    test("is redirected away from /admin/settings", async ({ page }) => {
      await page.goto("/admin/settings");
      // Middleware should redirect reviewers to /
      await expect(page).toHaveURL("/");
    });

    test("is redirected away from /admin/rules", async ({ page }) => {
      await page.goto("/admin/rules");
      await expect(page).toHaveURL("/");
    });

    test("can still access the dashboard", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL("/");
    });
  });
});
