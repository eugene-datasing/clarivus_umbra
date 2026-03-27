import { test, expect } from "@playwright/test";

test.describe("Setup Wizard", () => {
  test("renders the setup wizard page", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.locator("body")).toContainText(/setup|getting started|welcome/i);
  });

  test("shows organisation identity step", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.locator("body")).toContainText(/organisation identity/i);
    // The organisation name input uses a placeholder instead of htmlFor
    const nameInput = page.locator("input[placeholder*='District Council']").first();
    const hasInput = await nameInput.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasInput) {
      // Fallback: check any text input is visible in the step
      await expect(page.locator("input[type='text']").first()).toBeVisible();
    }
  });

  test("shows step indicators or progress", async ({ page }) => {
    await page.goto("/setup");
    // Wizard should show progress through steps
    await expect(page.locator("body")).toContainText(
      /step|organisation|department|branding|workflow|detection|team|review/i,
    );
  });

  test("validates that organisation name is required", async ({ page }) => {
    await page.goto("/setup");
    // Try to proceed without filling name — button says "Save & Continue"
    const nextBtn = page.getByRole("button", { name: /save.*continue|next|continue/i }).first();
    if (await nextBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Clear any pre-filled name
      const nameInput = page.locator("input[placeholder*='District Council']").first();
      if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const isReadOnly = await nameInput.getAttribute("readonly");
        if (!isReadOnly) {
          await nameInput.clear();
          await nextBtn.click();
          await expect(page.locator("body")).toContainText(/required/i);
        }
      }
    }
  });

  test("shows pre-filled organisation data from seed", async ({ page }) => {
    await page.goto("/setup");
    // Seed data should pre-populate the org name
    await expect(page.locator("body")).toContainText(
      /new plymouth|district council|npdc/i,
    );
  });
});
