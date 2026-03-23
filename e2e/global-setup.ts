/**
 * Playwright global setup — runs once before all test projects.
 *
 * Prerequisite: `npx tsx e2e/seed-test-users.ts` must have run first
 * (wired into the package.json `test:e2e` script).
 *
 * This setup:
 * 1. Logs in as each role via the credentials form.
 * 2. Saves storageState so test projects start pre-authenticated.
 */

import { test as setup, expect } from "@playwright/test";
import { TEST_USERS } from "./fixtures/test-data";

async function loginAndSaveState(
  page: import("@playwright/test").Page,
  user: { email: string; password: string },
  storageStatePath: string,
) {
  await page.goto("/login");

  // Wait for the credentials form (SSO is disabled in test env)
  await page.getByLabel("Email").waitFor({ state: "visible" });

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for navigation away from /login — confirms auth succeeded.
  // The destination may be "/" (dashboard) or "/activate" depending on state.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  await expect(page.locator("body")).not.toContainText("Invalid email or password");

  await page.context().storageState({ path: storageStatePath });
}

setup("authenticate test users", async ({ page }) => {
  // Log in as admin
  await loginAndSaveState(page, TEST_USERS.admin, "e2e/.auth/admin.json");

  // Log in as reviewer (new context to avoid session collision)
  const reviewerContext = await page.context().browser()!.newContext();
  const reviewerPage = await reviewerContext.newPage();
  await loginAndSaveState(reviewerPage, TEST_USERS.reviewer, "e2e/.auth/reviewer.json");
  await reviewerContext.close();
});
