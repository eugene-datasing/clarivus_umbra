import { test, expect } from "@playwright/test";

test.describe("Custom Redaction Rules", () => {
  test("renders the custom rules admin page", async ({ page }) => {
    await page.goto("/admin/rules");
    await expect(page.locator("body")).toContainText(/rules|redaction|custom/i);
  });

  test("shows a button to create a new rule", async ({ page }) => {
    await page.goto("/admin/rules");
    const createBtn = page.getByRole("button", { name: /new|create|add/i }).first();
    const hasBtn = await createBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasBtn).toBeTruthy();
  });

  test("can open the create rule form", async ({ page }) => {
    await page.goto("/admin/rules");
    const createBtn = page.getByRole("button", { name: /new|create|add/i }).first();
    if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createBtn.click();
      // A form or modal should appear with rule type fields
      await expect(page.locator("body")).toContainText(/keyword|pattern|entity|type/i);
    }
  });
});
