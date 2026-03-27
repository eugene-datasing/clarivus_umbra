import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Audit Trail", () => {
  const auditUrl = `/requests/${SEED.cases.coastalWalkway.id}/audit`;

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
    const search = page.getByPlaceholder(/search/i);
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
    // Seed data includes A. Richardson (Request Manager) and K. Williams (Reviewer)
    await expect(page.locator("body")).toContainText("A. Richardson");
    await expect(page.locator("body")).toContainText(/request manager/i);
    await expect(page.locator("body")).toContainText("K. Williams");
    await expect(page.locator("body")).toContainText(/reviewer/i);
  });

  test("shows timestamps on audit entries", async ({ page }) => {
    await page.goto(auditUrl);
    // Entries show date like "15 Mar 2026" and time like "09:00:12"
    await expect(page.locator("body")).toContainText(/Mar 2026/i);
  });

  test("shows detection accept/reject actions in the log", async ({
    page,
  }) => {
    await page.goto(auditUrl);
    await expect(page.locator("body")).toContainText(/accepted detection/i);
    await expect(page.locator("body")).toContainText(/rejected detection/i);
  });

  test("shows system events from Veil System", async ({ page }) => {
    await page.goto(auditUrl);
    await expect(page.locator("body")).toContainText("Veil System");
    await expect(page.locator("body")).toContainText(
      /document processing|detection pipeline/i,
    );
  });
});
