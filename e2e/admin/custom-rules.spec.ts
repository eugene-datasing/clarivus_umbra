import { test, expect } from "@playwright/test";

test.describe("Custom Detection Rules", () => {
  test("renders the custom rules page with heading", async ({ page }) => {
    await page.goto("/admin/rules");
    await expect(page.locator("h1, h2").first()).toContainText(
      /custom detection rules/i,
    );
  });

  test("shows the New Rule button", async ({ page }) => {
    await page.goto("/admin/rules");
    const newRuleBtn = page.getByRole("button", { name: /new rule/i });
    await expect(newRuleBtn).toBeVisible();
  });

  test("shows Import and Export buttons", async ({ page }) => {
    await page.goto("/admin/rules");
    await expect(
      page.getByRole("button", { name: /import/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export/i }),
    ).toBeVisible();
  });

  test("shows rules table with columns", async ({ page }) => {
    await page.goto("/admin/rules");
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Type" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  });

  test("shows empty state when no rules exist", async ({ page }) => {
    await page.goto("/admin/rules");
    await expect(page.locator("body")).toContainText(
      /no custom rules created/i,
    );
  });

  test("has a search input", async ({ page }) => {
    await page.goto("/admin/rules");
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
  });
});
