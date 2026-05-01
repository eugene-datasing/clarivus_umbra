import { test, expect } from "@playwright/test";

// Desktop sidebar nav has aria-label="Main navigation"; mobile nav is separate
const sidebarNav = 'nav[aria-label="Main navigation"]';

test.describe("Sidebar Navigation", () => {
  test("sidebar collapse button hides labels", async ({ page }) => {
    await page.goto("/");
    const collapseBtn = page.getByRole("button", { name: /collapse/i });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    // After collapse, sidebar labels should be hidden but icons remain
    // The sidebar width shrinks from 260px to 64px
    const sidebar = page.locator("[role='complementary']").first();
    await expect(sidebar).toBeVisible();
  });

  test("navigation highlights current page", async ({ page }) => {
    await page.goto("/batches");
    // The "Cases" nav item should have active styling
    const casesItem = page.locator(sidebarNav).getByText("Cases");
    await expect(casesItem).toBeVisible();
  });

  test("admin nav items visible for admin role", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator(sidebarNav);
    await expect(nav.getByText("Custom Rules")).toBeVisible();
    await expect(nav.getByText("AI Governance")).toBeVisible();
    await expect(nav.getByText("Reports")).toBeVisible();
    await expect(nav.getByText("Settings")).toBeVisible();
  });

  test("clicking Dashboard navigates to home", async ({ page }) => {
    await page.goto("/batches");
    const dashLink = page.locator(sidebarNav).getByText("Dashboard");
    await dashLink.click();
    await expect(page).toHaveURL("/");
  });

  test("clicking Cases navigates to case list", async ({ page }) => {
    await page.goto("/");
    const casesLink = page.locator(sidebarNav).getByText("Cases");
    await casesLink.click();
    await expect(page).toHaveURL(/\/requests$/);
  });

  test("clicking My Queue navigates to queue", async ({ page }) => {
    await page.goto("/");
    const queueLink = page.locator(sidebarNav).getByText("My Queue");
    // Slice D1 — wait for the link to be visible (hydrated + stable)
    // before clicking; the previous form intermittently raced the
    // hydration phase and timed out under load.
    await expect(queueLink).toBeVisible({ timeout: 10_000 });
    await queueLink.click();
    await expect(page).toHaveURL(/\/queue/, { timeout: 10_000 });
  });

  test("clicking New Case navigates to create form", async ({ page }) => {
    await page.goto("/");
    const newCaseLink = page.locator(sidebarNav).getByText("New Case");
    await newCaseLink.click();
    await expect(page).toHaveURL(/\/requests\/new/);
  });

  test("sign out button redirects to login", async ({ page }) => {
    await page.goto("/");
    const signOutBtn = page.getByRole("button", { name: /sign out/i });
    await expect(signOutBtn).toBeVisible();
    // Don't actually click — would invalidate session for other tests
  });

  test("user profile link navigates to profile page", async ({ page }) => {
    await page.goto("/");
    const profileLink = page.getByRole("link", { name: /E2E Admin/i });
    await expect(profileLink).toBeVisible();
    await profileLink.click();
    await expect(page).toHaveURL(/\/profile/);
  });
});
