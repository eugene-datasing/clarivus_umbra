import { test, expect } from "@playwright/test";

test.describe("404 — Not Found", () => {
  test("shows 404 page for non-existent route", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz");
    await expect(page.locator("body")).toContainText("404");
  });

  test("shows page not found message", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz");
    await expect(page.locator("body")).toContainText(/page not found/i);
  });

  test("has a link back to dashboard", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz");
    const backLink = page.getByRole("link", { name: /back to dashboard|go home|dashboard/i });
    await expect(backLink).toBeVisible();
  });

  test("back to dashboard link navigates correctly", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz");
    const backLink = page.getByRole("link", { name: /back to dashboard|go home|dashboard/i });
    await backLink.click();
    await page.waitForURL("/", { timeout: 10_000 });
  });
});
