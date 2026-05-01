import { test, expect } from "@playwright/test";
import { SEED } from "./fixtures/test-data";

/**
 * Screenshot audit — captures every key page for visual review.
 * Not a real test suite; used for manual inspection of what each page renders.
 */
test.describe("Screenshot Audit", () => {
  const pages = [
    { name: "dashboard", url: "/" },
    { name: "case-list", url: "/batches" },
    { name: "case-create", url: "/batches/new" },
    { name: "case-detail", url: `/batches/${SEED.cases.featherstonStreet.id}` },
    { name: "case-pipeline", url: `/batches/${SEED.cases.featherstonStreet.id}/pipeline` },
    { name: "case-ingest", url: `/batches/${SEED.cases.featherstonStreet.id}/ingest` },
    { name: "case-review-doc", url: `/batches/${SEED.cases.featherstonStreet.id}/review/${SEED.documents.mainCaseFile.id}` },
    { name: "case-review-compare", url: `/batches/${SEED.cases.featherstonStreet.id}/review/${SEED.documents.mainCaseFile.id}/compare` },
    { name: "case-bulk-review", url: `/batches/${SEED.cases.featherstonStreet.id}/bulk-review` },
    { name: "case-qa", url: `/batches/${SEED.cases.featherstonStreet.id}/qa` },
    { name: "case-schedule", url: `/batches/${SEED.cases.featherstonStreet.id}/schedule` },
    { name: "case-audit", url: `/batches/${SEED.cases.featherstonStreet.id}/audit` },
    { name: "case-export", url: `/batches/${SEED.cases.featherstonStreet.id}/export` },
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

  // Admin settings tabs — Slice D1 mapping reflects the current
  // two-tier nav: top-level tabs (Organisation, Detection, Workflow,
  // Integrations, Backup, System Health) with org-sub-tabs below
  // them (Departments, Users & Roles). Notifications now live under
  // the Workflow top-tab (see settings-client.tsx:596 + 655).
  const settingsTabs: Array<{ slug: string; topTab: string; subTab?: string }> = [
    { slug: "departments",       topTab: "Organisation",  subTab: "Departments" },
    { slug: "users-roles",       topTab: "Organisation",  subTab: "Users & Roles" },
    { slug: "detection-settings", topTab: "Detection" },
    { slug: "workflow",          topTab: "Workflow" },
    { slug: "notifications",     topTab: "Workflow" }, // section within Workflow
    { slug: "integrations",      topTab: "Integrations" },
    { slug: "backup-recovery",   topTab: "Backup" },
    { slug: "system-health",     topTab: "System Health" },
  ];

  for (const tab of settingsTabs) {
    test(`capture admin-settings-${tab.slug}`, async ({ page }) => {
      await page.goto("/admin/settings");
      await page.waitForLoadState("networkidle");
      // Click the top-level tab.
      await page.getByRole("button", { name: tab.topTab, exact: true }).click();
      await page.waitForTimeout(300);
      // If a sub-tab was specified, click it now. Sub-tab buttons
      // render with a count badge inside, so the accessible name is
      // "Departments 8" / "Users & Roles 11" — use a regex prefix
      // match rather than exact.
      if (tab.subTab) {
        const subTabRe = new RegExp(`^${tab.subTab.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\d*$`);
        await page.getByRole("button", { name: subTabRe }).click();
        await page.waitForTimeout(300);
      }
      await page.screenshot({
        path: `e2e/screenshots/admin-settings-${tab.slug}.png`,
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
    await reviewerPage.goto(`/batches/${SEED.cases.waterQuality.id}`);
    await reviewerPage.waitForLoadState("networkidle");
    await reviewerPage.screenshot({
      path: "e2e/screenshots/error-boundary.png",
      fullPage: true,
    });
    await reviewerCtx.close();
  });
});
