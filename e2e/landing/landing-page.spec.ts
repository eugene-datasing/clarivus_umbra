import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  // Use empty storage state to simulate unauthenticated visitor
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders the marketing landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText(/redaction|disclosure|lgoima/i);
  });

  test("shows Veil branding and tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(/veil/i);
    await expect(page.locator("body")).toContainText(/clarivus/i);
  });

  test("shows key product stats", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(/10,000/);
    await expect(page.locator("body")).toContainText(/nz data sovereignty|100%/i);
  });

  test("has top navigation with feature sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Features" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Product" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Security" })).toBeVisible();
  });

  test("has Sign In and Request Demo buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /request demo/i }).first()).toBeVisible();
  });

  test("Sign In link navigates to login page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /sign in/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows demo request form", async ({ page }) => {
    await page.goto("/");
    // Scroll to contact section
    await page.evaluate(() => {
      const el = document.querySelector("#contact");
      if (el) el.scrollIntoView();
    });
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByLabel(/organisation/i)).toBeVisible();
  });

  test("validates demo request form fields", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const el = document.querySelector("#contact");
      if (el) el.scrollIntoView();
    });
    // Submit with empty fields
    const submitBtn = page.getByRole("button", { name: /send|submit|request/i }).last();
    await submitBtn.click();
    // Should show validation error
    await expect(page.locator("body")).toContainText(/required|please|fill/i);
  });

  test("submits demo request form successfully", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const el = document.querySelector("#contact");
      if (el) el.scrollIntoView();
    });
    // Fill out the form
    await page.getByLabel(/name/i).first().fill("Test User");
    await page.getByLabel(/email/i).first().fill("test@example.com");
    await page.getByLabel(/organisation/i).fill("Test Organisation");
    await page.getByLabel(/message/i).fill("E2E test submission");

    const submitBtn = page.getByRole("button", { name: /send|submit|request/i }).last();
    await submitBtn.click();

    // Should show success state
    await expect(page.locator("body")).toContainText(/thank you|in touch|24 hours/i, {
      timeout: 10_000,
    });
  });

  test("shows security and compliance section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(/privacy act|lgoima|public records/i);
  });

  test("shows DataSing branding link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /datasing/i }).first()).toBeVisible();
  });
});
