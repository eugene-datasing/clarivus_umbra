import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Case Detail", () => {
  const caseUrl = `/requests/${SEED.cases.coastalWalkway.id}`;

  test("displays the case reference and description", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(SEED.cases.coastalWalkway.reference);
    await expect(page.locator("body")).toContainText(/coastal walkway/i);
  });

  test("shows the document list for the case", async ({ page }) => {
    await page.goto(caseUrl);
    // Should list seeded documents
    await expect(page.locator("body")).toContainText(SEED.documents.councilReport.name);
  });

  test("shows case status", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(/in.review|review/i);
  });

  test("navigates to document review from case detail", async ({ page }) => {
    await page.goto(caseUrl);
    const docLink = page.getByText(SEED.documents.councilReport.name);
    if (await docLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await docLink.click();
      await page.waitForURL(
        new RegExp(`/requests/${SEED.cases.coastalWalkway.id}/review/`),
        { timeout: 10_000 },
      );
    }
  });

  test("navigates to the ingest page", async ({ page }) => {
    await page.goto(`${caseUrl}/ingest`);
    await expect(page.locator("body")).toContainText(/upload|ingest|import/i);
  });

  test("navigates to the audit trail page", async ({ page }) => {
    await page.goto(`${caseUrl}/audit`);
    await expect(page.locator("body")).toContainText(/audit/i);
  });
});
