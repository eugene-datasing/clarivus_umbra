import { test, expect } from "@playwright/test";
import path from "path";
import { SEED } from "../fixtures/test-data";

test.describe("Document Ingestion", () => {
  const ingestUrl = `/batches/${SEED.cases.featherstonStreet.id}/ingest`;

  test("renders the upload/ingest page", async ({ page }) => {
    await page.goto(ingestUrl);
    await expect(page.locator("body")).toContainText(/upload|ingest|import|drag/i);
  });

  test("shows a file drop zone or upload button", async ({ page }) => {
    await page.goto(ingestUrl);
    const dropZone = page.locator('[aria-label*="dropzone"], [class*="drop"], [class*="upload"]').first();
    const uploadInput = page.locator('input[type="file"]');
    const hasDropZone = await dropZone.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasInput = await uploadInput.count();
    expect(hasDropZone || hasInput > 0).toBeTruthy();
  });

  test("can select a PDF file for upload", async ({ page }) => {
    await page.goto(ingestUrl);
    const fileInput = page.locator('input[type="file"]');
    const fixturePath = path.resolve(__dirname, "../fixtures/test-document.pdf");
    await fileInput.setInputFiles(fixturePath);

    // After selecting a file, the page should show the filename or a file list
    await expect(page.locator("body")).toContainText(/test-document\.pdf|1 file|selected/i);
  });
});
