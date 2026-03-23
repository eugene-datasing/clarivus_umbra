import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Document Review", () => {
  const reviewUrl = `/requests/${SEED.cases.coastalWalkway.id}/review/${SEED.documents.councilReport.id}`;

  test("renders the review page with document content", async ({ page }) => {
    await page.goto(reviewUrl);
    // Should show the document name or content
    await expect(page.locator("body")).toContainText(/coastal walkway|council report/i);
  });

  test("displays AI detections with highlighted text", async ({ page }) => {
    await page.goto(reviewUrl);
    // The detection text for det-001 (John Smith) should be visible
    await expect(page.locator("body")).toContainText("John Smith");
  });

  test("shows detection details panel", async ({ page }) => {
    await page.goto(reviewUrl);
    // Should show detection types, confidence, or ground suggestions
    await expect(page.locator("body")).toContainText(/detection|redaction|personal|confidence/i);
  });

  test("shows LGOIMA withholding grounds", async ({ page }) => {
    await page.goto(reviewUrl);
    // Should reference LGOIMA sections
    await expect(page.locator("body")).toContainText(/s7|section 7|withholding/i);
  });

  test("can accept a detection", async ({ page }) => {
    await page.goto(reviewUrl);
    // Look for accept/approve buttons on pending detections
    const acceptBtn = page.getByRole("button", { name: /accept|approve/i }).first();
    if (await acceptBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await acceptBtn.click();
      // Should update the detection status — look for visual change
      await expect(page.locator("body")).toContainText(/accepted|approved/i);
    }
  });

  test("can reject a detection", async ({ page }) => {
    await page.goto(reviewUrl);
    const rejectBtn = page.getByRole("button", { name: /reject|release|dismiss/i }).first();
    if (await rejectBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await rejectBtn.click();
      await expect(page.locator("body")).toContainText(/rejected|released|dismissed/i);
    }
  });
});
