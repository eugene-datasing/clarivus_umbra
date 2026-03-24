import { test, expect } from "@playwright/test";
import { SEED } from "./fixtures/test-data";

/**
 * Screenshot audit — captures every key page for visual review.
 * Not a real test suite; used for manual inspection of what each page renders.
 */
test.describe("Screenshot Audit", () => {
  const pages = [
    { name: "dashboard", url: "/" },
    { name: "case-list", url: "/requests" },
    { name: "case-create", url: "/requests/new" },
    { name: "case-detail", url: `/requests/${SEED.cases.coastalWalkway.id}` },
    { name: "case-pipeline", url: `/requests/${SEED.cases.coastalWalkway.id}/pipeline` },
    { name: "case-ingest", url: `/requests/${SEED.cases.coastalWalkway.id}/ingest` },
    { name: "case-review-doc", url: `/requests/${SEED.cases.coastalWalkway.id}/review/${SEED.documents.councilReport.id}` },
    { name: "case-review-compare", url: `/requests/${SEED.cases.coastalWalkway.id}/review/${SEED.documents.councilReport.id}/compare` },
    { name: "case-bulk-review", url: `/requests/${SEED.cases.coastalWalkway.id}/bulk-review` },
    { name: "case-qa", url: `/requests/${SEED.cases.coastalWalkway.id}/qa` },
    { name: "case-schedule", url: `/requests/${SEED.cases.coastalWalkway.id}/schedule` },
    { name: "case-audit", url: `/requests/${SEED.cases.coastalWalkway.id}/audit` },
    { name: "case-export", url: `/requests/${SEED.cases.coastalWalkway.id}/export` },
    { name: "profile", url: "/profile" },
    { name: "queue", url: "/queue" },
    { name: "reports", url: "/reports" },
    { name: "admin-settings-org", url: "/admin/settings" },
    { name: "admin-rules", url: "/admin/rules" },
    { name: "admin-ai-governance", url: "/admin/ai-governance" },
    { name: "not-found", url: "/this-page-does-not-exist-xyz" },
  ];

  for (const p of pages) {
    test(`capture ${p.name}`, async ({ page }) => {
      await page.goto(p.url);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: `e2e/screenshots/${p.name}.png`,
        fullPage: true,
      });
    });
  }

  // Admin settings tabs need separate captures
  const settingsTabs = [
    "Departments",
    "Users & Roles",
    "Detection Settings",
    "Workflow",
    "Notifications",
    "Integrations",
    "Backup & Recovery",
    "System Health",
  ];

  for (const tabName of settingsTabs) {
    const slug = tabName.toLowerCase().replace(/[^a-z]+/g, "-");
    test(`capture admin-settings-${slug}`, async ({ page }) => {
      await page.goto("/admin/settings");
      await page.waitForLoadState("networkidle");
      // For Notifications tab, scope to main content to avoid sidebar match
      if (tabName === "Notifications") {
        const mainContent = page.locator("[role='main'], #main-content, main").first();
        await mainContent.getByRole("button", { name: tabName, exact: true }).click();
      } else {
        await page.getByRole("button", { name: tabName, exact: true }).click();
      }
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `e2e/screenshots/admin-settings-${slug}.png`,
        fullPage: true,
      });
    });
  }

  // Error boundary page (as reviewer accessing restricted case)
  test("capture error-boundary", async ({ page, browser }) => {
    // Create a new context with reviewer auth
    const reviewerCtx = await browser.newContext({
      storageState: "e2e/.auth/reviewer.json",
    });
    const reviewerPage = await reviewerCtx.newPage();
    await reviewerPage.goto(`/requests/${SEED.cases.communityTrust.id}`);
    await reviewerPage.waitForLoadState("networkidle");
    await reviewerPage.screenshot({
      path: "e2e/screenshots/error-boundary.png",
      fullPage: true,
    });
    await reviewerCtx.close();
  });
});
