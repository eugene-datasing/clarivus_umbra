import { test, expect } from "@playwright/test";

test.describe("Notifications", () => {
  test("shows notification bell icon in sidebar", async ({ page }) => {
    await page.goto("/");
    // The sidebar has a bell button in the bottom user section
    const sidebar = page.locator("#main-navigation");
    await expect(sidebar).toBeVisible();
    // Bell is rendered as a button inside the sidebar bottom section
    const bellBtn = sidebar.locator("button").filter({ has: page.locator("svg") });
    const count = await bellBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test("can open notification panel", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("#main-navigation");
    // Click the notification bell (it's in the bottom section, find button with Bell icon)
    const buttons = sidebar.locator("button");
    const count = await buttons.count();
    // Click the last non-signout button which should be the bell
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      if (text && /sign out/i.test(text)) continue;
      const ariaLabel = await btn.getAttribute("aria-label");
      if (ariaLabel && /notification|bell/i.test(ariaLabel)) {
        await btn.click();
        break;
      }
    }
    // Panel should show notifications or empty state
    await expect(page.locator("body")).toContainText(
      /notification|no recent activity/i,
    );
  });
});

test.describe("Sidebar Navigation", () => {
  test("shows main navigation links", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("#main-navigation");
    await expect(nav).toBeVisible();
    await expect(nav).toContainText(/dashboard/i);
    await expect(nav).toContainText(/cases/i);
  });

  test("shows admin links for admin users", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("#main-navigation");
    await expect(nav).toContainText(/settings|rules|governance|reports/i);
  });

  test("shows My Queue link", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("#main-navigation");
    // My Queue is a link inside the sidebar
    await expect(nav).toContainText(/my queue/i);
  });

  test("shows user profile section in sidebar", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("#main-navigation");
    await expect(nav).toContainText(/E2E Admin/i);
  });

  test("has a sign out button", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("#main-navigation");
    const signOutBtn = nav.getByRole("button", { name: /sign out/i });
    await expect(signOutBtn).toBeVisible();
  });

  test("shows New Case link", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("#main-navigation");
    await expect(nav).toContainText(/new case/i);
  });
});
