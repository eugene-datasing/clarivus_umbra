import { test, expect } from "@playwright/test";

test.describe("Error Boundary — Access Denied", () => {
  // Use the reviewer's auth — reviewers are scoped by department
  test.use({ storageState: "e2e/.auth/reviewer.json" });

  /**
   * TODO Slice D-followup: req-003 (water-quality) in the PNCC seed
   * has departments that may overlap the e2e reviewer's assignment,
   * so the access-denied path doesn't trigger reliably. Restore once
   * a target case is selected that's guaranteed-out-of-department for
   * the test reviewer.
   */
  test.fixme("shows user-friendly error when accessing a case outside the user's department", async ({
    page,
  }) => {
    await page.goto("/requests/req-003");
    await expect(page.locator("body")).toContainText(/error loading case/i);
    await expect(page.locator("body")).toContainText(/permission|access/i);
  });

  test("shows Back to Cases button on error page", async ({ page }) => {
    await page.goto("/requests/req-003");
    const backBtn = page.getByRole("link", { name: /back to cases/i });
    await expect(backBtn).toBeVisible();
  });

  test("shows Retry button on error page", async ({ page }) => {
    await page.goto("/requests/req-003");
    const retryBtn = page.getByRole("button", { name: /retry/i }).or(
      page.getByRole("button", { name: /try again/i }),
    );
    await expect(retryBtn).toBeVisible();
  });

  test("does not leak raw error message or stack trace in the page content", async ({ page }) => {
    await page.goto("/requests/req-003");
    // Check the main content area, excluding the Next.js dev overlay
    // which may contain internal error details in development mode.
    const mainContent = page.locator("main, [role='main']").or(
      page.locator("body > div#__next"),
    );
    const text = await mainContent.first().textContent();
    expect(text).not.toContain("authorizeForCase");
    expect(text).not.toContain("user has no department assignment");
  });
});
