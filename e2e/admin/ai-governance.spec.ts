import { test, expect } from "@playwright/test";

test.describe("AI Governance", () => {
  test("renders the AI governance page with heading", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    await expect(page.locator("h1, h2").first()).toContainText(/ai governance|model governance/i);
  });

  test("shows accuracy metrics (precision, recall, F1)", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    await expect(page.locator("body")).toContainText(/precision/i);
    await expect(page.locator("body")).toContainText(/recall|accepted/i);
    await expect(page.locator("body")).toContainText(/f1|score/i);
  });

  test("shows false positive rate", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    await expect(page.locator("body")).toContainText(/false positive/i);
  });

  test("shows accuracy by entity type table", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    await expect(page.locator("body")).toContainText(/personal name/i);
    await expect(page.locator("body")).toContainText(/phone number/i);
    await expect(page.locator("body")).toContainText(/email address/i);
  });

  test("shows confidence score distribution", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    await expect(page.locator("body")).toContainText(/confidence.*distribution|score.*distribution/i);
    await expect(page.locator("body")).toContainText(/high|medium|low/i);
  });

  test("shows model information", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    await expect(page.locator("body")).toContainText(/azure openai|gpt-4o/i);
    await expect(page.locator("body")).toContainText(/provider|version|model/i);
  });

  test("shows false negative rate section", async ({ page }) => {
    await page.goto("/admin/ai-governance");
    await expect(page.locator("body")).toContainText(/false negative|miss rate|manual detection/i);
  });
});
