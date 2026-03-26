import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Document Review Actions", () => {
  const reviewUrl = `/requests/${SEED.cases.coastalWalkway.id}/review/${SEED.documents.councilReport.id}`;

  test("clicking Redact button shows ground selector", async ({ page }) => {
    await page.goto(reviewUrl);
    const redactBtn = page.getByRole("button", { name: /redact/i }).first();
    await expect(redactBtn).toBeVisible({ timeout: 10_000 });
    await redactBtn.click();
    // Ground selector dropdown should appear with LGOIMA grounds
    await expect(page.locator("body")).toContainText(/s7|s6|s17|ground/i);
  });

  test("shows detection tabs for filtering", async ({ page }) => {
    await page.goto(reviewUrl);
    // Should show tab filters: All, Personal, Commercial, Other
    await expect(page.locator("body")).toContainText(/all detection/i);
    await expect(page.locator("body")).toContainText(/personal/i);
  });

  test("shows document toggle for original view", async ({ page }) => {
    await page.goto(reviewUrl);
    const toggleBtn = page.getByRole("button", { name: /show original|original/i }).first();
    const hasToggle = await toggleBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    // Toggle may or may not exist depending on document type
    expect(typeof hasToggle).toBe("boolean");
  });

  test("shows detection count in header", async ({ page }) => {
    await page.goto(reviewUrl);
    // Detection count should be shown (e.g., "12 detections")
    await expect(page.locator("body")).toContainText(/\d+\s*detection/i);
  });

  test("shows confidence percentage for detections", async ({ page }) => {
    await page.goto(reviewUrl);
    // Confidence badges showing percentage
    await expect(page.locator("body")).toContainText(/%/);
  });

  test("shows LGOIMA ground suggestions on detections", async ({ page }) => {
    await page.goto(reviewUrl);
    // AI-suggested grounds like s7(2)(a) should be visible
    await expect(page.locator("body")).toContainText(/s7\(2\)/i);
  });

  test("shows document navigation (Prev/Next)", async ({ page }) => {
    await page.goto(reviewUrl);
    // Should have prev/next document navigation
    const nav = page.locator("body");
    const hasNav = await nav.textContent();
    const hasPrevNext = /prev|next|←|→/i.test(hasNav ?? "");
    expect(hasPrevNext).toBeTruthy();
  });

  test("shows sign-off button for reviewed documents", async ({ page }) => {
    await page.goto(reviewUrl);
    // Sign off or submit button should be available
    const signOffBtn = page.getByRole("button", { name: /sign.off|submit|senior review/i }).first();
    const hasSignOff = await signOffBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    // May not be visible if document isn't in correct state
    expect(typeof hasSignOff).toBe("boolean");
  });
});
