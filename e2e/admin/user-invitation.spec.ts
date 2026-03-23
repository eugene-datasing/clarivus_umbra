import { test, expect } from "@playwright/test";

test.describe("User Invitation — Admin Settings", () => {
  test("can navigate to the Users & Roles tab", async ({ page }) => {
    await page.goto("/admin/settings");

    // Click on the Users & Roles tab
    const usersTab = page.getByRole("button", { name: /users.*roles/i }).or(
      page.getByText(/users.*roles/i),
    );
    await usersTab.click();

    await expect(page.locator("body")).toContainText(/active users/i);
  });

  test("shows the seeded users in the users table", async ({ page }) => {
    await page.goto("/admin/settings");
    const usersTab = page.getByRole("button", { name: /users.*roles/i }).or(
      page.getByText(/users.*roles/i),
    );
    await usersTab.click();

    // Should show the seed users and the e2e test users
    await expect(page.locator("body")).toContainText(/Richardson|Mitchell|E2E Admin/i);
  });

  test("shows role badges for users", async ({ page }) => {
    await page.goto("/admin/settings");
    const usersTab = page.getByRole("button", { name: /users.*roles/i }).or(
      page.getByText(/users.*roles/i),
    );
    await usersTab.click();

    await expect(page.locator("body")).toContainText(/admin|reviewer|request manager/i);
  });

  test("can navigate to the Departments tab", async ({ page }) => {
    await page.goto("/admin/settings");
    const deptTab = page.getByRole("button", { name: /departments/i }).or(
      page.getByText("Departments"),
    );
    await deptTab.click();

    // Should show department names
    await expect(page.locator("body")).toContainText(/infrastructure|planning|legal/i);
  });

  test("shows department status badges", async ({ page }) => {
    await page.goto("/admin/settings");
    const deptTab = page.getByRole("button", { name: /departments/i }).or(
      page.getByText("Departments"),
    );
    await deptTab.click();

    await expect(page.locator("body")).toContainText(/active/i);
  });
});
