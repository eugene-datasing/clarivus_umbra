import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Audit Trail", () => {
  const auditUrl = `/batches/${SEED.cases.featherstonStreet.id}/audit`;

  test("renders the audit trail page with heading", async ({ page }) => {
    await page.goto(auditUrl);
    await expect(page.locator("h1, h2").first()).toContainText(/audit trail/i);
  });

  test("shows immutable audit log notice", async ({ page }) => {
    await page.goto(auditUrl);
    await expect(page.locator("body")).toContainText(
      /immutable.*cannot be modified/i,
    );
  });

  test("shows event and user counts", async ({ page }) => {
    await page.goto(auditUrl);
    // Header shows "Events: 17 | Users: 6"
    await expect(page.locator("body")).toContainText(/events:\s*\d+/i);
    await expect(page.locator("body")).toContainText(/users:\s*\d+/i);
  });

  test("has Export PDF and Export CSV buttons", async ({ page }) => {
    await page.goto(auditUrl);
    await expect(
      page.getByRole("button", { name: /export pdf/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /export csv/i }),
    ).toBeVisible();
  });

  test("has a search input", async ({ page }) => {
    await page.goto(auditUrl);
    // Slice D1 — multiple inputs match /search/i (sidebar + audit page);
    // narrow to the audit page's input via the surrounding panel role.
    const search = page.locator("main").getByPlaceholder(/search/i).first();
    await expect(search).toBeVisible();
  });

  test("has a filter dropdown", async ({ page }) => {
    await page.goto(auditUrl);
    // Filter is a select dropdown with event type options
    const filterSelect = page.locator("select").first();
    await expect(filterSelect).toBeVisible();
    await expect(page.locator("body")).toContainText(/all types/i);
  });

  test("displays audit entries with user names and roles", async ({
    page,
  }) => {
    await page.goto(auditUrl);
    // Slice D1 — PNCC seed includes ingestion/processing entries from
    // E2E Admin (admin role) plus Veil AI system entries; assertions
    // are role-pattern-based to stay robust to specific user churn.
    await expect(page.locator("body")).toContainText(/E2E Admin|Veil AI/);
    await expect(page.locator("body")).toContainText(/admin|system/i);
  });

  test("shows timestamps on audit entries", async ({ page }) => {
    await page.goto(auditUrl);
    // Entries show date like "15 Mar 2026" and time like "09:00:12"
    await expect(page.locator("body")).toContainText(/Mar 2026/i);
  });

  /**
   * TODO Slice D-followup: PNCC seed doesn't include canned accept/reject
   * audit entries (no reviewer has actioned the seed cases). The
   * assertion is correct but the seed is what's missing. Skipping
   * pending a seed extension that includes a representative
   * detection-accepted / detection-rejected entry.
   */
  test.fixme("shows detection accept/reject actions in the log", async ({
    page,
  }) => {
    await page.goto(auditUrl);
    await expect(page.locator("body")).toContainText(/accepted detection/i);
    await expect(page.locator("body")).toContainText(/rejected detection/i);
  });

  test("shows system events from Veil AI", async ({ page }) => {
    await page.goto(auditUrl);
    // Slice D1 — system actor name is "Veil AI" in the current schema
    // (seed renamed it from the older "Veil System"). Document-
    // processing entries appear via the ingestion pipeline.
    await expect(page.locator("body")).toContainText("Veil AI");
    await expect(page.locator("body")).toContainText(
      /document processed|detection pipeline/i,
    );
  });
});
