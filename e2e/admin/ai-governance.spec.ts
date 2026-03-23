import { test, expect } from "@playwright/test";

test.describe("AI Governance", () => {
  test("renders the AI governance dashboard", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    await expect(page.locator("body")).toContainText(/ai|governance|model|accuracy/i);
  });

  test("shows AI metrics or model information", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    const body = await page.locator("body").textContent();
    const hasMetrics = /accuracy|precision|recall|confidence|false.positive|model/i.test(body ?? "");
    expect(hasMetrics).toBeTruthy();
  });
});
