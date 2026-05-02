import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe.fixme("Case List Search & Filter", () => {
  test.fixme("search input filters cases by reference", async ({ page }) => {
    await page.goto("/batches");
    // Multiple inputs match /search/i on this page (sidebar + cases
    // page); narrow to the cases-page input via the main scope.
    const search = page.locator("main").getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible();
    await search.fill(SEED.cases.featherstonStreet.reference);
    await expect(page.locator("body")).toContainText(SEED.cases.featherstonStreet.reference);
  });

  test.fixme("search input filters cases by requester name", async ({ page }) => {
    await page.goto("/batches");
    // Multiple inputs match /search/i on this page (sidebar + cases
    // page); narrow to the cases-page input via the main scope.
    const search = page.locator("main").getByPlaceholder(/search/i).first();
    // PNCC seed — search by Manawatū Standard (req-001's requester).
    await search.fill("Manawatū");
    await expect(page.locator("body")).toContainText(SEED.cases.featherstonStreet.reference);
  });

  test.fixme("search with no results shows appropriate message", async ({ page }) => {
    await page.goto("/batches");
    const search = page.getByPlaceholder(/search/i);
    await search.fill("zzz-nonexistent-query-999");
    // Should show empty state or no matching results
    await expect(page.locator("body")).toContainText(/no.*case|no.*result|no.*match/i);
  });

  test.fixme("shows filter button", async ({ page }) => {
    await page.goto("/batches");
    const filterBtn = page.getByRole("button", { name: /filter/i });
    await expect(filterBtn).toBeVisible();
  });

  test.fixme("filter panel opens and shows filter options", async ({ page }) => {
    await page.goto("/batches");
    const filterBtn = page.getByRole("button", { name: /filter/i });
    await filterBtn.click();
    // Filter panel should show status, priority, department dropdowns
    await expect(page.locator("body")).toContainText(/status|priority|department/i);
  });

  test.fixme("shows case status badges in the table", async ({ page }) => {
    await page.goto("/batches");
    // Cases should display status badges
    await expect(page.locator("body")).toContainText(
      /in review|triage|senior review|draft/i,
    );
  });

  test.fixme("shows deadline working days remaining", async ({ page }) => {
    await page.goto("/batches");
    // Deadline column shows working days
    await expect(page.locator("body")).toContainText(/remaining|overdue|working day/i);
  });

  test.fixme("clicking a case row navigates to case detail", async ({ page }) => {
    await page.goto("/batches");
    const caseRow = page.getByText(SEED.cases.featherstonStreet.reference);
    await caseRow.click();
    await expect(page).toHaveURL(
      new RegExp(`/batches/${SEED.cases.featherstonStreet.id}`),
    );
  });
});
