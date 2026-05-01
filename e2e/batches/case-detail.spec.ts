import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Case Detail", () => {
  const caseUrl = `/requests/${SEED.cases.featherstonStreet.id}`;

  test("displays the case reference", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(
      SEED.cases.featherstonStreet.reference,
    );
  });

  test("displays the case description", async ({ page }) => {
    await page.goto(caseUrl);
    // PNCC seed — req-001 is the Featherston Street case.
    await expect(page.locator("body")).toContainText(/Featherston Street/i);
  });

  test("shows the document list for the case", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(
      SEED.documents.mainCaseFile.name,
    );
  });

  test("shows case status badge", async ({ page }) => {
    await page.goto(caseUrl);
    await expect(page.locator("body")).toContainText(/in review/i);
  });

  test("navigates to document review from case detail", async ({ page }) => {
    await page.goto(caseUrl);
    // Multiple documents on req-001 share the same name (multiple
    // copies of 04_main_case_file_long.docx); use first() and click.
    const docLink = page.getByText(SEED.documents.mainCaseFile.name).first();
    await expect(docLink).toBeVisible();
    await docLink.click();
    await page.waitForURL(
      new RegExp(`/requests/${SEED.cases.featherstonStreet.id}/review/`),
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
