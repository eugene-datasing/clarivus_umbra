import { test, expect } from "@playwright/test";

test.describe("User Profile", () => {
  test("renders the profile page with user details", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("h1")).toContainText(/profile/i);
    await expect(page.locator("body")).toContainText(/name/i);
    await expect(page.locator("body")).toContainText(/email/i);
    await expect(page.locator("body")).toContainText(/role/i);
  });

  test("displays the current user name and email", async ({ page }) => {
    await page.goto("/profile");
    // The E2E admin user should see their own details
    await expect(page.locator("body")).toContainText(/E2E Admin/i);
    await expect(page.locator("body")).toContainText("e2e-admin@veil-test.local");
  });

  test("displays the user role", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("body")).toContainText(/admin/i);
  });

  test("shows the department dropdown", async ({ page }) => {
    await page.goto("/profile");
    const departmentSelect = page.locator("select#department");
    await expect(departmentSelect).toBeVisible();
    // Should include at least the seeded departments
    await expect(departmentSelect).toContainText(/infrastructure/i);
  });

  test("has a Save Changes button", async ({ page }) => {
    await page.goto("/profile");
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await expect(saveBtn).toBeVisible();
  });

  test("can change department selection", async ({ page }) => {
    await page.goto("/profile");
    const departmentSelect = page.locator("select#department");
    await expect(departmentSelect).toBeVisible();
    // Select a different department
    await departmentSelect.selectOption({ label: "Planning" });
    // Verify selection changed
    await expect(departmentSelect).toHaveValue("dept-002");
  });
});
