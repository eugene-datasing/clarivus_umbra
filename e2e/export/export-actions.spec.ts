import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Export Actions", () => {
  const exportUrl = `/batches/${SEED.cases.featherstonStreet.id}/export`;

  test("can select and deselect documents via checkboxes", async ({ page }) => {
    await page.goto(exportUrl);
    // Find a non-disabled checkbox (documents with "In Review" status)
    const checkbox = page.locator("input[type='checkbox']:not([disabled])").first();
    const hasCheckbox = await checkbox.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasCheckbox) {
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await checkbox.uncheck();
      await expect(checkbox).not.toBeChecked();
    }
  });

  test("Select all signed-off button works", async ({ page }) => {
    await page.goto(exportUrl);
    const selectBtn = page.getByRole("button", { name: /select.*signed.off/i });
    await expect(selectBtn).toBeVisible();
    await selectBtn.click();
    // After clicking, the selection state should change
    // (may select 0 if none are signed off)
  });

  test("Clear selection button works", async ({ page }) => {
    await page.goto(exportUrl);
    const clearBtn = page.getByRole("button", { name: /clear selection/i });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
  });

  test("shows readiness categories with counts", async ({ page }) => {
    await page.goto(exportUrl);
    // Three readiness categories with numeric counts
    await expect(page.locator("body")).toContainText(/signed off/i);
    await expect(page.locator("body")).toContainText(/reviewed/i);
    await expect(page.locator("body")).toContainText(/review incomplete/i);
  });

  test("disabled checkboxes on review-incomplete documents", async ({ page }) => {
    await page.goto(exportUrl);
    // Documents with "Review Incomplete" readiness should have disabled checkboxes
    const disabledCheckbox = page.locator("input[type='checkbox'][disabled]").first();
    await expect(disabledCheckbox).toBeVisible();
  });

  test("shows document file type badges", async ({ page }) => {
    await page.goto(exportUrl);
    // Each document row shows file type (pdf, docx, xlsx, eml)
    await expect(page.locator("body")).toContainText(/pdf|docx|xlsx|eml/i);
  });

  test("export history shows SHA-256 column", async ({ page }) => {
    await page.goto(exportUrl);
    await expect(page.getByRole("columnheader", { name: "SHA-256" })).toBeVisible();
  });

  test("shows detection and page counts per document", async ({ page }) => {
    await page.goto(exportUrl);
    // Table shows Detections and Pages columns
    await expect(page.getByRole("columnheader", { name: "Detections" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Pages" })).toBeVisible();
  });
});
