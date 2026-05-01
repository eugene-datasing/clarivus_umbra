import { test, expect } from "@playwright/test";

test.describe("Create Case — End-to-End", () => {
  test("fills the form, submits, and arrives at the new case", async ({ page }) => {
    await page.goto("/requests/new");

    // Capture the auto-generated reference for later assertion
    const refInput = page.locator('input[value*="LGOIMA"]');
    await expect(refInput).toHaveValue(/LGOIMA-\d{4}-\d{3}/);
    const reference = await refInput.inputValue();

    // Fill required fields — use placeholder text as a more stable locator
    await page.getByPlaceholder("Full name of the requester").fill("E2E Full-Flow Requester");

    // Select requester type
    const requesterTypeSelect = page.locator("select").filter({ hasText: "Individual" }).first();
    await requesterTypeSelect.selectOption("Media");

    // Select at least one department (checkbox)
    const infrastructureCheckbox = page.getByLabel("Infrastructure");
    if (await infrastructureCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await infrastructureCheckbox.check();
    } else {
      await page.locator('input[type="checkbox"]').first().check();
    }

    // Fill description
    await page.getByPlaceholder(/full text of the LGOIMA request/i).fill(
      "E2E test: full case creation flow via Playwright.",
    );

    // Submit
    await page.getByRole("button", { name: /create case/i }).click();

    // Should see success toast with the reference
    await expect(page.locator("body")).toContainText(/case created/i, { timeout: 10_000 });
    await expect(page.locator("body")).toContainText(reference);

    // Should redirect to the pipeline page for the new case
    await page.waitForURL(/\/requests\/.*\/pipeline/, { timeout: 15_000 });
  });

  test("shows validation error when no department is selected", async ({ page }) => {
    await page.goto("/requests/new");

    await page.getByPlaceholder("Full name of the requester").fill("Missing Dept Requester");
    await page.getByPlaceholder(/full text of the LGOIMA request/i).fill(
      "Should fail validation.",
    );

    await page.getByRole("button", { name: /create case/i }).click();

    // Should show department validation error
    await expect(page.locator("body")).toContainText(/select at least one department/i);
  });
});
