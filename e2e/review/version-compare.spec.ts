import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Version Comparison", () => {
  const compareUrl = `/requests/${SEED.cases.coastalWalkway.id}/review/${SEED.documents.councilReport.id}/compare`;

  test("renders the version comparison page", async ({ page }) => {
    await page.goto(compareUrl);
    await expect(page.locator("body")).toContainText(/compare|version|original|redacted/i);
  });

  test("shows side-by-side or tabbed document views", async ({ page }) => {
    await page.goto(compareUrl);
    // Should contain references to original and redacted versions
    const body = await page.locator("body").textContent();
    const hasComparison = /original|draft|final|before|after/i.test(body ?? "");
    expect(hasComparison).toBeTruthy();
  });
});
