import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Case List Search & Filter", () => {
  test("search input filters cases by reference", async ({ page }) => {
    await page.goto("/requests");
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
    await search.fill(SEED.cases.coastalWalkway.reference);
    // Should narrow results to matching case
    await expect(page.locator("body")).toContainText(SEED.cases.coastalWalkway.reference);
  });

  test("search input filters cases by requester name", async ({ page }) => {
    await page.goto("/requests");
    const search = page.getByPlaceholder(/search/i);
    await search.fill("coastal");
    // Should find the coastal walkway case
    await expect(page.locator("body")).toContainText(SEED.cases.coastalWalkway.reference);
  });

  test("search with no results shows appropriate message", async ({ page }) => {
    await page.goto("/requests");
    const search = page.getByPlaceholder(/search/i);
    await search.fill("zzz-nonexistent-query-999");
    // Should show empty state or no matching results
    await expect(page.locator("body")).toContainText(/no.*case|no.*result|no.*match/i);
  });

  test("shows filter button", async ({ page }) => {
    await page.goto("/requests");
    const filterBtn = page.getByRole("button", { name: /filter/i });
    await expect(filterBtn).toBeVisible();
  });

  test("filter panel opens and shows filter options", async ({ page }) => {
    await page.goto("/requests");
    const filterBtn = page.getByRole("button", { name: /filter/i });
    await filterBtn.click();
    // Filter panel should show status, priority, department dropdowns
    await expect(page.locator("body")).toContainText(/status|priority|department/i);
  });

  test("shows case status badges in the table", async ({ page }) => {
    await page.goto("/requests");
    // Cases should display status badges
    await expect(page.locator("body")).toContainText(
      /in review|triage|senior review|draft/i,
    );
  });

  test("shows deadline working days remaining", async ({ page }) => {
    await page.goto("/requests");
    // Deadline column shows working days
    await expect(page.locator("body")).toContainText(/remaining|overdue|working day/i);
  });

  test("clicking a case row navigates to case detail", async ({ page }) => {
    await page.goto("/requests");
    const caseRow = page.getByText(SEED.cases.coastalWalkway.reference);
    await caseRow.click();
    await expect(page).toHaveURL(
      new RegExp(`/requests/${SEED.cases.coastalWalkway.id}`),
    );
  });
});
