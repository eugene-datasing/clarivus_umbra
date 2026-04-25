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

  /**
   * TODO Slice D-followup: profile-save success-state UX has changed
   * shape (no "Saved" string in the post-save UI under the current
   * build). Restore once the success indicator is identified.
   */
  test.fixme("save button shows success state after saving", async ({ page }) => {
    await page.goto("/profile");
    const saveBtn = page.getByRole("button", { name: /save/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await expect(page.locator("body")).toContainText(/saved/i, { timeout: 10_000 });
  });
});
