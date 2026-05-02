import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe.fixme("Case List & Filtering", () => {
  test.fixme("renders the cases list page", async ({ page }) => {
    await page.goto("/batches");
    await expect(page.locator("body")).toContainText(/cases|requests/i);
  });

  test.fixme("shows the New Case button", async ({ page }) => {
    await page.goto("/batches");
    const newCaseBtn = page.getByRole("link", { name: /new case|new request|create/i });
    await expect(newCaseBtn).toBeVisible();
  });

  test.fixme("displays seeded case references in the table", async ({ page }) => {
    await page.goto("/batches");
    await expect(page.locator("body")).toContainText(SEED.cases.featherstonStreet.reference);
    await expect(page.locator("body")).toContainText(SEED.cases.resourceConsent.reference);
  });

  test.fixme("shows case count", async ({ page }) => {
    await page.goto("/batches");
    // Should show total or active case count
    await expect(page.locator("body")).toContainText(/\d+ (cases|requests|total|active)/i);
  });

  test.fixme("has a search input", async ({ page }) => {
    await page.goto("/batches");
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await expect(searchInput).toBeVisible();
  });

  test.fixme("can search for a case by reference", async ({ page }) => {
    await page.goto("/batches");
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await searchInput.fill(SEED.cases.featherstonStreet.reference);
    // After search, should still show the matching case
    await expect(page.locator("body")).toContainText(SEED.cases.featherstonStreet.reference);
  });

  test.fixme("has filter controls", async ({ page }) => {
    await page.goto("/batches");
    // Should have a filter button or filter selects
    const filterBtn = page.getByRole("button", { name: /filter/i });
    if (await filterBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await filterBtn.click();
    }
    // Filter panel should include status, priority, or department
    await expect(page.locator("body")).toContainText(/status|priority|department/i);
  });

  test.fixme("shows status badges for cases", async ({ page }) => {
    await page.goto("/batches");
    await expect(page.locator("body")).toContainText(
      /in review|pending|completed|triage|new/i,
    );
  });

  test.fixme("shows deadline information for cases", async ({ page }) => {
    await page.goto("/batches");
    // Table should show deadlines
    await expect(page.locator("body")).toContainText(/deadline|due|202\d/i);
  });

  test.fixme("clicking a case navigates to its detail page", async ({ page }) => {
    await page.goto("/batches");
    const caseLink = page
      .getByRole("link", { name: new RegExp(SEED.cases.featherstonStreet.reference) })
      .or(page.locator(`a[href*="${SEED.cases.featherstonStreet.id}"]`).first());

    if (await caseLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await caseLink.click();
      await page.waitForURL(new RegExp(SEED.cases.featherstonStreet.id), {
        timeout: 10_000,
      });
    }
  });

  test.fixme("shows document count column", async ({ page }) => {
    await page.goto("/batches");
    await expect(page.locator("body")).toContainText(/document/i);
  });

  test.fixme("shows department tags for cases", async ({ page }) => {
    await page.goto("/batches");
    await expect(page.locator("body")).toContainText(/infrastructure|planning|legal/i);
  });

  test.fixme("shows empty state when search has no results", async ({ page }) => {
    await page.goto("/batches");
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await searchInput.fill("ZZZZZ-NONEXISTENT-99999");
    await expect(page.locator("body")).toContainText(/no cases|no results|no match/i);
  });
});
