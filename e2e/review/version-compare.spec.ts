import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Version Comparison", () => {
  const compareUrl = `/requests/${SEED.cases.featherstonStreet.id}/review/${SEED.documents.mainCaseFile.id}/compare`;

  test("renders the version comparison page", async ({ page }) => {
    await page.goto(compareUrl);
    await expect(page.locator("body")).toContainText(/version/i);
  });

  /**
   * FINDING: The compare page shows "No Snapshots Available" for this document.
   * Snapshots are only created when a document is submitted for senior review
   * or signed off. The seed data doesn't include version snapshots for this doc.
   *
   * This is a REAL GAP: the compare feature cannot be E2E tested without
   * seed data that includes at least one document with a draft or final snapshot.
   */
  test("shows empty state when no snapshots exist", async ({ page }) => {
    await page.goto(compareUrl);
    await expect(page.locator("body")).toContainText(/no snapshots available/i);
  });

  test("has a back to review link", async ({ page }) => {
    await page.goto(compareUrl);
    const backLink = page.getByRole("link", { name: /back to review/i });
    await expect(backLink).toBeVisible();
  });

  test("explains when snapshots are created", async ({ page }) => {
    await page.goto(compareUrl);
    // The empty state should explain the conditions for snapshot creation
    await expect(page.locator("body")).toContainText(/senior review|signed off/i);
  });
});
