import { test, expect } from "@playwright/test";

test.describe("Create Case Form Validation", () => {
  test("shows auto-generated reference number", async ({ page }) => {
    await page.goto("/requests/new");
    // Reference field should be pre-populated and read-only
    const refField = page.getByLabel(/reference/i);
    await expect(refField).toBeVisible();
    const refValue = await refField.inputValue();
    expect(refValue).toMatch(/LGOIMA-/);
  });

  test("shows requester type dropdown with options", async ({ page }) => {
    await page.goto("/requests/new");
    const typeSelect = page.getByLabel(/requester type|type/i).first();
    await expect(typeSelect).toBeVisible();
  });

  test("shows department checkboxes", async ({ page }) => {
    await page.goto("/requests/new");
    // Department selection with checkboxes
    await expect(page.locator("body")).toContainText(/department/i);
    const checkbox = page.locator("input[type='checkbox']").first();
    await expect(checkbox).toBeVisible();
  });

  test("validates required fields on submit", async ({ page }) => {
    await page.goto("/requests/new");
    // Clear required fields and try to submit
    const requesterName = page.getByLabel(/requester name|requester/i).first();
    await requesterName.clear();

    const submitBtn = page.getByRole("button", { name: /create|submit/i });
    await submitBtn.click();

    // Should show validation error
    await expect(page.locator("body")).toContainText(
      /required|select at least one department|please/i,
    );
  });

  test("shows statutory deadline calculated from date received", async ({ page }) => {
    await page.goto("/requests/new");
    // Statutory deadline is auto-calculated (+20 working days)
    await expect(page.locator("body")).toContainText(/statutory deadline|deadline/i);
  });

  test("shows priority selector", async ({ page }) => {
    await page.goto("/requests/new");
    await expect(page.locator("body")).toContainText(/priority/i);
    await expect(page.locator("body")).toContainText(/standard|urgent/i);
  });

  test("shows description textarea", async ({ page }) => {
    await page.goto("/requests/new");
    const description = page.getByLabel(/description|details/i).first();
    await expect(description).toBeVisible();
  });

  test("successful submission shows toast and redirects", async ({ page }) => {
    await page.goto("/requests/new");

    // Fill the form
    const requesterName = page.getByLabel(/requester name|requester/i).first();
    await requesterName.fill("E2E Test Requester");

    // Select a department
    const checkbox = page.locator("input[type='checkbox']").first();
    await checkbox.check();

    // Fill description
    const description = page.getByLabel(/description|details/i).first();
    await description.fill("E2E test case for coverage expansion");

    // Submit
    const submitBtn = page.getByRole("button", { name: /create|submit/i });
    await submitBtn.click();

    // Should show success or redirect
    await expect(page.locator("body")).toContainText(
      /case created|redirecting|pipeline/i,
      { timeout: 15_000 },
    );
  });
});
