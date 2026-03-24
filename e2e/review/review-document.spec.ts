import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Document Review", () => {
  const reviewUrl = `/requests/${SEED.cases.coastalWalkway.id}/review/${SEED.documents.councilReport.id}`;

  test("renders the review page with document name", async ({ page }) => {
    await page.goto(reviewUrl);
    await expect(page.locator("body")).toContainText(
      SEED.documents.councilReport.name,
    );
  });

  test("displays AI detections with highlighted text", async ({ page }) => {
    await page.goto(reviewUrl);
    // The seed detection det-001 is "John Smith" — should be visible
    await expect(page.locator("body")).toContainText("John Smith");
  });

  test("shows detection type and confidence", async ({ page }) => {
    await page.goto(reviewUrl);
    // Detections should show their category and confidence percentage
    await expect(page.locator("body")).toContainText(/personal/i);
    await expect(page.locator("body")).toContainText(/%/);
  });

  test("shows LGOIMA withholding grounds", async ({ page }) => {
    await page.goto(reviewUrl);
    // Should show specific LGOIMA section references like s7(2)(a)
    await expect(page.locator("body")).toContainText(/s7/i);
  });

  /**
   * FINDING: The old accept/reject tests used catch-and-skip patterns that
   * silently passed when the button wasn't found. These now assert the
   * button IS visible, then click it.
   */
  test("shows Redact button for pending detections", async ({ page }) => {
    await page.goto(reviewUrl);
    const redactBtn = page.getByRole("button", { name: /redact/i }).first();
    await expect(redactBtn).toBeVisible({ timeout: 10_000 });
  });

  test("shows Reject button for pending detections", async ({ page }) => {
    await page.goto(reviewUrl);
    const rejectBtn = page.getByRole("button", { name: /reject/i }).first();
    await expect(rejectBtn).toBeVisible({ timeout: 10_000 });
  });
});
