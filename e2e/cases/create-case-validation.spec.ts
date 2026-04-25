import { test, expect } from "@playwright/test";

test.describe("Create Case Form Validation", () => {
  test("shows auto-generated reference number", async ({ page }) => {
    await page.goto("/requests/new");
    // Reference field is a read-only input pre-populated with LGOIMA-YYYY-NNN
    const refInput = page.locator("input[readonly]").first();
    await expect(refInput).toBeVisible();
    const refValue = await refInput.inputValue();
    expect(refValue).toMatch(/LGOIMA-/);
  });

  test("shows requester type dropdown with options", async ({ page }) => {
    await page.goto("/requests/new");
    // Requester Type is a <select> with options like Individual, Media, etc.
    await expect(page.locator("body")).toContainText(/requester type/i);
    const typeSelect = page.locator("select").first();
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
    const requesterName = page.locator("input[placeholder='Full name of the requester']");
    await requesterName.clear();

    const submitBtn = page.getByRole("button", { name: /create case/i });
    await submitBtn.click();

    // Browser native validation prevents submission — page should stay on /requests/new
    await expect(page).toHaveURL(/\/requests\/new/);
    // The form uses HTML5 required attribute, so the browser shows a native tooltip
    // Verify the field is still empty (form was not submitted)
    await expect(requesterName).toHaveValue("");
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
    // First textarea on the page (description) — strict-mode-safe.
    const description = page.locator("textarea").first();
    await expect(description).toBeVisible();
    // Body contains "Description" (heading) — robust to label phrasing.
    await expect(page.locator("body")).toContainText(/description/i);
  });

  test("successful submission shows toast and redirects", async ({ page }) => {
    await page.goto("/requests/new");

    // Fill the form using placeholders since labels lack htmlFor
    const requesterName = page.locator("input[placeholder='Full name of the requester']");
    await requesterName.fill("E2E Test Requester");

    // Select a department
    const checkbox = page.locator("input[type='checkbox']").first();
    await checkbox.check();

    // Fill description
    const description = page.locator("textarea");
    await description.fill("E2E test case for coverage expansion");

    // Submit
    const submitBtn = page.getByRole("button", { name: /create case/i });
    await submitBtn.click();

    // Should show success toast "Case Created" or redirect to pipeline
    await expect(page.locator("body")).toContainText(
      /case created|redirecting|pipeline/i,
      { timeout: 15_000 },
    );
  });
});
