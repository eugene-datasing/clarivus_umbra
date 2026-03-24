import { test, expect } from "@playwright/test";
import { TEST_USERS } from "../fixtures/test-data";

test.describe("Login", () => {
  // These tests don't use stored auth — they test the login flow itself
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows the credentials login form when SSO is disabled", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("rejects invalid credentials with an error message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@invalid.local");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator("#login-error")).toContainText("Invalid email or password");
    // Should stay on the login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in with valid credentials and redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_USERS.admin.email);
    await page.getByLabel("Password").fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for navigation away from /login
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 15_000,
    });
    await expect(page.locator("body")).not.toContainText("Invalid email or password");
  });

  test("shows landing page with sign-in link for unauthenticated users", async ({ page }) => {
    await page.goto("/");
    // Unauthenticated users see the marketing landing page (not a redirect to /login)
    const signInLink = page.getByRole("link", { name: /sign in/i }).first();
    await expect(signInLink).toBeVisible({ timeout: 10_000 });
  });

  test("redirects unauthenticated users accessing /requests to /login", async ({ page }) => {
    await page.goto("/requests/new");
    await expect(page).toHaveURL(/\/login/);
  });
});
