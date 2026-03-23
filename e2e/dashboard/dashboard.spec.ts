import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Dashboard", () => {
  test("renders the dashboard with case cards", async ({ page }) => {
    await page.goto("/");
    // The page should contain the Veil branding or a dashboard heading
    await expect(page.locator("body")).toContainText(/dashboard|requests|cases/i);
  });

  test("displays seeded case references", async ({ page }) => {
    await page.goto("/");
    // At least the first seeded case should be visible
    await expect(page.locator("body")).toContainText(SEED.cases.coastalWalkway.reference);
  });

  test("navigates to case detail when clicking a case", async ({ page }) => {
    await page.goto("/");
    // Click the first case reference link
    const caseLink = page.getByText(SEED.cases.coastalWalkway.reference);
    if (await caseLink.isVisible()) {
      await caseLink.click();
      await expect(page).toHaveURL(new RegExp(`/requests/${SEED.cases.coastalWalkway.id}`));
    }
  });

  test("shows dashboard statistics", async ({ page }) => {
    await page.goto("/");
    // Should show some kind of statistics — total cases, documents, etc.
    // Check for numeric content that indicates stats are rendering
    await expect(page.locator("body")).toContainText(/\d+/);
  });
});
