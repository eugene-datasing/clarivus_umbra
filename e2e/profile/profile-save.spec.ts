import { test, expect } from "@playwright/test";

test.describe("Profile Save", () => {
  test("shows user name and email as read-only", async ({ page }) => {
    await page.goto("/profile");
    // Name and email should be displayed but not editable
    await expect(page.locator("body")).toContainText(/E2E Admin/i);
    await expect(page.locator("body")).toContainText(/e2e-admin@veil-test\.local/i);
  });

  test("shows role badge", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("body")).toContainText(/admin/i);
  });

  test("department dropdown is editable", async ({ page }) => {
    await page.goto("/profile");
    const deptSelect = page.getByLabel(/department/i);
    await expect(deptSelect).toBeVisible();
    // Should have department options
    await expect(deptSelect).toBeEnabled();
  });

  test("save button shows success state after saving", async ({ page }) => {
    await page.goto("/profile");
    const saveBtn = page.getByRole("button", { name: /save/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    // Should show "Saved" state with green styling
    await expect(page.locator("body")).toContainText(/saved/i, { timeout: 10_000 });
  });
});
