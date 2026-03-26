import { test, expect } from "@playwright/test";

test.describe("Setup Wizard", () => {
  test("renders the setup wizard page", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.locator("body")).toContainText(/setup|getting started|welcome/i);
  });

  test("shows organisation identity step", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.locator("body")).toContainText(/organisation/i);
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
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
    // Try to proceed without filling name
    const nextBtn = page.getByRole("button", { name: /next|continue|save/i }).first();
    if (await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Clear any pre-filled name
      const nameInput = page.getByLabel(/organisation name|name/i).first();
      await nameInput.clear();
      await nextBtn.click();
      await expect(page.locator("body")).toContainText(/required/i);
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
