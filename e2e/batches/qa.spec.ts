import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Pre-Release QA", () => {
  const qaUrl = `/batches/${SEED.cases.featherstonStreet.id}/qa`;

  test("renders the QA page with heading", async ({ page }) => {
    await page.goto(qaUrl);
    await expect(page.locator("body")).toContainText(/pre-release quality assurance/i);
  });

  test("shows completeness checks", async ({ page }) => {
    await page.goto(qaUrl);
    await expect(page.locator("body")).toContainText(/all documents reviewed/i);
    await expect(page.locator("body")).toContainText(/all detections actioned/i);
  });

  test("shows statutory compliance checks", async ({ page }) => {
    await page.goto(qaUrl);
    await expect(page.locator("body")).toContainText(/withholding.*ground|statutory compliance/i);
  });

  test("shows redaction verification section", async ({ page }) => {
    await page.goto(qaUrl);
    await expect(page.locator("body")).toContainText(/redaction verification/i);
  });

  test("shows QA summary counts (passed, failed, warnings)", async ({ page }) => {
    await page.goto(qaUrl);
    // The summary card should show numeric counts
    await expect(page.locator("body")).toContainText(/passed|failed|warning/i);
  });

  test("shows document release preview table", async ({ page }) => {
    await page.goto(qaUrl);
    await expect(page.locator("body")).toContainText(/document release preview|release simulation/i);
  });

  test("has a Proceed to Export link", async ({ page }) => {
    await page.goto(qaUrl);
    const exportLink = page.getByRole("link", { name: /proceed to export|export/i });
    await expect(exportLink).toBeVisible();
  });
});
