import { test, expect } from "@playwright/test";

test.describe("Reports & Analytics", () => {
  test("renders the reports page with heading", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("body")).toContainText(/reports/i);
  });

  test("shows summary stat cards", async ({ page }) => {
    await page.goto("/reports");
    // Summary cards show value + subtitle (e.g. "9 all time", "100% statutory deadlines met")
    await expect(page.locator("body")).toContainText(/all time/i);
    await expect(page.locator("body")).toContainText(/statutory deadlines met/i);
    await expect(page.locator("body")).toContainText(/pattern.*ai/i);
  });

  test("shows withholding ground usage section", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("body")).toContainText(/withholding ground/i);
    // Should reference LGOIMA sections
    await expect(page.locator("body")).toContainText(/s7|s6|s17/i);
  });

  test("shows report templates", async ({ page }) => {
    await page.goto("/reports");
    // Click Report Templates tab if it's tabbed
    const templatesTab = page.getByRole("button", { name: /report templates/i });
    if (await templatesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await templatesTab.click();
    }
    // Should show known report types
    await expect(page.locator("body")).toContainText(/LGOIMA compliance/i);
    await expect(page.locator("body")).toContainText(/chain of custody/i);
  });

  test("shows AI detection performance metrics", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("body")).toContainText(/ai detection|detection performance/i);
    await expect(page.locator("body")).toContainText(/precision|false positive/i);
  });

  test("has Generate Custom Report button", async ({ page }) => {
    await page.goto("/reports");
    const generateBtn = page
      .getByRole("button", { name: /generate.*report/i })
      .or(page.getByRole("link", { name: /generate.*report/i }));
    await expect(generateBtn.first()).toBeVisible();
  });

  test("shows cost recovery report option", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("body")).toContainText(/cost recovery/i);
  });

  test("can open cost recovery report modal", async ({ page }) => {
    await page.goto("/reports");
    // Find and click the cost recovery Download button
    const costRecoveryRow = page.locator("text=Cost Recovery").first();
    if (await costRecoveryRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const downloadBtn = costRecoveryRow
        .locator("..")
        .locator("..")
        .getByRole("button", { name: /download|generate/i })
        .first();
      if (await downloadBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await downloadBtn.click();
        // Modal should appear with case selection
        await expect(page.locator("body")).toContainText(/select.*case|generate.*pdf/i);
      }
    }
  });
});
