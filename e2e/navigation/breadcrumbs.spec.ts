import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Breadcrumb Navigation", () => {
  test("case detail shows breadcrumb trail", async ({ page }) => {
    await page.goto(`/requests/${SEED.cases.featherstonStreet.id}`);
    // Breadcrumbs: Cases > LGOIMA-2026-042
    await expect(page.getByRole("link", { name: "Cases" })).toBeVisible();
    await expect(page.locator("body")).toContainText(SEED.cases.featherstonStreet.reference);
  });

  test("review page shows link back to case", async ({ page }) => {
    const reviewUrl = `/requests/${SEED.cases.featherstonStreet.id}/review/${SEED.documents.mainCaseFile.id}`;
    await page.goto(reviewUrl);
    // Review page has "Back to Case" link, not a breadcrumb with the reference
    const backLink = page.getByRole("link", { name: /back to case/i });
    await expect(backLink).toBeVisible();
  });

  test("clicking Cases breadcrumb navigates to case list", async ({ page }) => {
    await page.goto(`/requests/${SEED.cases.featherstonStreet.id}`);
    const casesLink = page.getByRole("link", { name: "Cases" });
    await casesLink.click();
    await expect(page).toHaveURL(/\/requests$/);
  });

  test("export page shows case breadcrumb", async ({ page }) => {
    await page.goto(`/requests/${SEED.cases.featherstonStreet.id}/export`);
    await expect(page.getByRole("link", { name: "Cases" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Export");
  });

  test("audit trail page shows breadcrumb trail", async ({ page }) => {
    await page.goto(`/requests/${SEED.cases.featherstonStreet.id}/audit`);
    await expect(page.getByRole("link", { name: "Cases" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Audit Trail");
  });

  test("case detail tabs navigate between sub-pages", async ({ page }) => {
    await page.goto(`/requests/${SEED.cases.featherstonStreet.id}`);
    // Click Schedule tab
    const scheduleTab = page.getByRole("link", { name: "Schedule" });
    await scheduleTab.click();
    await expect(page).toHaveURL(/\/schedule/);
    // Click Audit Trail tab
    const auditTab = page.getByRole("link", { name: "Audit Trail" });
    await auditTab.click();
    await expect(page).toHaveURL(/\/audit/);
    // Click Export tab
    const exportTab = page.getByRole("link", { name: "Export" });
    await exportTab.click();
    await expect(page).toHaveURL(/\/export/);
    // Click Documents tab to go back
    const docsTab = page.getByRole("link", { name: "Documents" });
    await docsTab.click();
    await expect(page).toHaveURL(new RegExp(`/requests/${SEED.cases.featherstonStreet.id}$`));
  });
});
