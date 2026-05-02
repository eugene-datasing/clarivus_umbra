import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe.fixme("Dashboard", () => {
  test.fixme("renders the dashboard with heading", async ({ page }) => {
    await page.goto("/");
    // The main content area should show a dashboard, not just any page
    const mainContent = page.locator("[role='main'], #main-content, main").first();
    await expect(mainContent).toContainText(/dashboard|active cases|recent/i);
  });

  test.fixme("displays seeded case references", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(
      SEED.cases.featherstonStreet.reference,
    );
  });

  test.fixme("navigates to case detail when clicking a case", async ({ page }) => {
    await page.goto("/");
    const caseLink = page.getByText(SEED.cases.featherstonStreet.reference);
    await expect(caseLink).toBeVisible();
    await caseLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/batches/${SEED.cases.featherstonStreet.id}`),
    );
  });

  test.fixme("shows case status badges", async ({ page }) => {
    await page.goto("/");
    // Dashboard should show status indicators for cases
    await expect(page.locator("body")).toContainText(
      /in review|triage|pending|senior review/i,
    );
  });

  test.fixme("shows deadline information for cases", async ({ page }) => {
    await page.goto("/");
    // Cases should show deadline/due date info
    await expect(page.locator("body")).toContainText(/remaining|overdue|due/i);
  });
});
