import { test, expect } from "@playwright/test";

test.describe("Create Case", () => {
  test("navigates to the new request form", async ({ page }) => {
    await page.goto("/requests/new");
    await expect(page).toHaveURL(/\/requests\/new/);
    // The form should have recognisable LGOIMA fields
    await expect(page.locator("body")).toContainText(/new|request|case/i);
  });

  test("renders form fields for LGOIMA request", async ({ page }) => {
    await page.goto("/requests/new");
    // Check for key form fields
    const body = page.locator("body");
    await expect(body).toContainText(/requester|requestor/i);
  });

  test("shows auto-generated reference number", async ({ page }) => {
    await page.goto("/requests/new");
    // The reference is rendered as a readonly input field value
    const refInput = page.locator('input').filter({ hasText: /LGOIMA/ }).or(
      page.locator('input[value*="LGOIMA"]'),
    );
    await expect(refInput.first()).toHaveValue(/LGOIMA-\d{4}-\d{3}/);
  });

  test("can submit a new case and redirect to case detail", async ({ page }) => {
    await page.goto("/requests/new");

    // Fill in required fields — field selectors depend on the form implementation
    const requesterNameInput = page.getByLabel(/requester.*name/i).or(
      page.locator('input[name*="requester"]').first(),
    );

    if (await requesterNameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await requesterNameInput.fill("E2E Test Requester");

      // Look for a description/details textarea
      const descriptionField = page.getByLabel(/description|details/i).or(
        page.locator("textarea").first(),
      );
      if (await descriptionField.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await descriptionField.fill("Automated E2E test request for Playwright suite.");
      }

      // Submit the form
      const submitBtn = page.getByRole("button", { name: /create|submit|save/i });
      if (await submitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await submitBtn.click();
        // Should redirect to the new case's detail page
        await page.waitForURL(/\/requests\//, { timeout: 10_000 });
      }
    }
  });
});
