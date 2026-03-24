import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Case Detail", () => {
  const caseUrl = `/requests/${SEED.cases.coastalWalkway.id}`;

  test("displays the case reference", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(
      SEED.cases.coastalWalkway.reference,
    );
  });

  test("displays the case description", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(/coastal walkway/i);
  });

  test("shows the document list for the case", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(
      SEED.documents.councilReport.name,
    );
  });

  test("shows case status badge", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(/in review/i);
  });

  test("navigates to document review from case detail", async ({ page }) => {
    await page.goto(caseUrl);
    const docLink = page.getByText(SEED.documents.councilReport.name);
    await expect(docLink).toBeVisible();
    await docLink.click();
    await page.waitForURL(
      new RegExp(`/requests/${SEED.cases.coastalWalkway.id}/review/`),
      { timeout: 10_000 },
    );
  });

  test("shows case tabs for navigation", async ({ page }) => {
    await page.goto(caseUrl);
    // Case detail page should have tabs: Documents, Schedule, Audit Trail, Export
    await expect(page.locator("body")).toContainText(/documents/i);
    await expect(page.locator("body")).toContainText(/schedule/i);
    await expect(page.locator("body")).toContainText(/audit trail/i);
    await expect(page.locator("body")).toContainText(/export/i);
  });
});
