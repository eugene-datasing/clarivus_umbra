import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Export Package", () => {
  const exportUrl = `/requests/${SEED.cases.coastalWalkway.id}/export`;

  test("renders the export page with heading", async ({ page }) => {
    await page.goto(exportUrl);
    await expect(page.locator("h1, h2").first()).toContainText(/export/i);
  });

  test("shows document readiness summary", async ({ page }) => {
    await page.goto(exportUrl);
    // The page shows 3 readiness categories: signed off, reviewed, review incomplete
    await expect(page.locator("body")).toContainText(/signed off|ready to export/i);
    await expect(page.locator("body")).toContainText(/review incomplete|cannot export/i);
  });

  test("shows document selection table with columns", async ({ page }) => {
    await page.goto(exportUrl);
    await expect(page.locator("body")).toContainText(/select documents to export/i);
    await expect(page.getByRole("columnheader", { name: "Document", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  });

  test("lists seeded documents in the export table", async ({ page }) => {
    await page.goto(exportUrl);
    await expect(page.locator("body")).toContainText(SEED.documents.councilReport.name);
  });

  test("shows export history section", async ({ page }) => {
    await page.goto(exportUrl);
    await expect(page.locator("body")).toContainText(/export history/i);
    // No exports yet for this case
    await expect(page.locator("body")).toContainText(/no exports generated/i);
  });

  test("has Select all signed-off link", async ({ page }) => {
    await page.goto(exportUrl);
    await expect(page.locator("body")).toContainText(/select.*signed.off/i);
  });

  /**
   * FINDING: The export page does NOT show requester/internal/ombudsman
   * radio buttons as previously tested. It's a document selection table
   * where you pick which documents to include. The old test was a false pass
   * matching "requester" from the page description text.
   */
  test("shows message when no documents are selected", async ({ page }) => {
    await page.goto(exportUrl);
    await expect(page.locator("body")).toContainText(
      /select at least one document/i,
    );
  });
});
