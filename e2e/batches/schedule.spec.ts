import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Withholding Schedule", () => {
  const scheduleUrl = `/batches/${SEED.cases.featherstonStreet.id}/schedule`;

  test("renders the withholding schedule page", async ({ page }) => {
    await page.goto(scheduleUrl);
    await expect(page.locator("body")).toContainText(/withholding schedule/i);
  });

  test("shows the case reference", async ({ page }) => {
    await page.goto(scheduleUrl);
    await expect(page.locator("body")).toContainText(SEED.cases.featherstonStreet.reference);
  });

  test("shows the schedule items table with grounds", async ({ page }) => {
    await page.goto(scheduleUrl);
    // Schedule should show LGOIMA grounds like s7(1), s6(a) etc.
    await expect(page.locator("body")).toContainText(/s7|s6|ground/i);
  });

  test("shows the covering statement section", async ({ page }) => {
    await page.goto(scheduleUrl);
    // The covering statement textarea should contain LGOIMA template text
    const coveringArea = page.locator("textarea");
    if (await coveringArea.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const value = await coveringArea.inputValue();
      expect(value.length).toBeGreaterThan(0);
    } else {
      // May be rendered as a text section instead
      await expect(page.locator("body")).toContainText(/covering statement|dear/i);
    }
  });

  test("shows the right of review standard text", async ({ page }) => {
    await page.goto(scheduleUrl);
    await expect(page.locator("body")).toContainText(/right of review|ombudsman/i);
  });

  test("has a Preview as PDF button", async ({ page }) => {
    await page.goto(scheduleUrl);
    const previewBtn = page.getByRole("link", { name: /preview.*pdf/i }).or(
      page.getByRole("button", { name: /preview.*pdf/i }),
    );
    await expect(previewBtn).toBeVisible();
  });
});
