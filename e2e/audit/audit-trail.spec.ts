import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Audit Trail", () => {
  const auditUrl = `/requests/${SEED.cases.coastalWalkway.id}/audit`;

  test("renders the audit trail page", async ({ page }) => {
    await page.goto(auditUrl);
    await expect(page.locator("body")).toContainText(/audit/i);
  });

  test("displays seeded audit entries", async ({ page }) => {
    await page.goto(auditUrl);
    // Seed includes "A. Richardson" creating the case
    await expect(page.locator("body")).toContainText(/Richardson|created|upload/i);
  });

  test("shows timestamps on audit entries", async ({ page }) => {
    await page.goto(auditUrl);
    // Audit entries should contain date-like content (e.g. Mar 2026 or 2026-03)
    await expect(page.locator("body")).toContainText(/2026|Mar|March/i);
  });

  test("shows user roles in audit entries", async ({ page }) => {
    await page.goto(auditUrl);
    await expect(page.locator("body")).toContainText(
      /Request Manager|Reviewer|Senior Reviewer|System/i,
    );
  });

  test("shows detection review actions in audit log", async ({ page }) => {
    await page.goto(auditUrl);
    // Seed includes detection accepted/rejected actions
    await expect(page.locator("body")).toContainText(/accept|reject|review|approv/i);
  });
});
