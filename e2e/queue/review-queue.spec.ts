import { test, expect } from "@playwright/test";

test.describe("My Review Queue", () => {
  test("renders the review queue page", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.locator("h1")).toContainText(/my review queue/i);
  });

  test("shows document count in the subtitle", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.locator("body")).toContainText(/documents? awaiting/i);
  });

  test("groups documents by case with reference links", async ({ page }) => {
    await page.goto("/queue");
    // If queue has documents, they should be grouped under case references
    const hasDocuments = await page
      .locator("body")
      .textContent()
      .then((text) => !/queue is empty/i.test(text ?? ""));

    if (hasDocuments) {
      // Case references should be links
      const refLink = page.locator("a").filter({ hasText: /LGOIMA-/ }).first();
      await expect(refLink).toBeVisible();
    }
  });

  test("shows deadline indicators for queued cases", async ({ page }) => {
    await page.goto("/queue");
    const hasDocuments = await page
      .locator("body")
      .textContent()
      .then((text) => !/queue is empty/i.test(text ?? ""));

    if (hasDocuments) {
      // Should show deadline info (overdue, due today, or days remaining)
      await expect(page.locator("body")).toContainText(
        /overdue|due today|\d+d remaining/i,
      );
    }
  });

  test("shows Start Review buttons for queued documents", async ({ page }) => {
    await page.goto("/queue");
    const hasDocuments = await page
      .locator("body")
      .textContent()
      .then((text) => !/queue is empty/i.test(text ?? ""));

    if (hasDocuments) {
      const startBtn = page.getByRole("link", { name: /start review/i }).first();
      await expect(startBtn).toBeVisible();
    }
  });

  test("shows empty state when no documents are queued", async ({ page }) => {
    await page.goto("/queue");
    // Either shows documents or the empty state — one must be true
    const body = await page.locator("body").textContent();
    const hasQueue = /start review/i.test(body ?? "");
    const hasEmpty = /queue is empty/i.test(body ?? "");
    expect(hasQueue || hasEmpty).toBeTruthy();
  });

  test("shows detection counts for queued documents", async ({ page }) => {
    await page.goto("/queue");
    const hasDocuments = await page
      .locator("body")
      .textContent()
      .then((text) => !/queue is empty/i.test(text ?? ""));

    if (hasDocuments) {
      await expect(page.locator("body")).toContainText(/\d+ detections?/i);
    }
  });
});
