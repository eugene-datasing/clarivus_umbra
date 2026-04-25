import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

test.describe("Pipeline Configuration", () => {
  const pipelineUrl = `/requests/${SEED.cases.featherstonStreet.id}/pipeline`;

  test("renders the pipeline page with case reference", async ({ page }) => {
    await page.goto(pipelineUrl);
    await expect(page.locator("body")).toContainText(SEED.cases.featherstonStreet.reference);
  });

  test("shows pipeline stages", async ({ page }) => {
    await page.goto(pipelineUrl);
    // Pipeline should show workflow stages
    await expect(page.locator("body")).toContainText(
      /ingest|triage|review|approve|qa|export|pipeline/i,
    );
  });

  test("has a Save Pipeline button", async ({ page }) => {
    await page.goto(pipelineUrl);
    const saveBtn = page.getByRole("button", { name: /save pipeline/i }).or(
      page.getByRole("button", { name: /save/i }),
    );
    await expect(saveBtn.first()).toBeVisible();
  });

  test("shows assignment palette with departments", async ({ page }) => {
    await page.goto(pipelineUrl);
    // The palette sidebar should show departments and reviewers
    await expect(page.locator("body")).toContainText(/department|reviewer|approver/i);
  });

  test("shows stage date inputs", async ({ page }) => {
    await page.goto(pipelineUrl);
    // Each stage should have date fields
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test("shows stage statistics", async ({ page }) => {
    await page.goto(pipelineUrl);
    // Should show count of configured stages or assignments
    await expect(page.locator("body")).toContainText(/stage|configured|assignment/i);
  });
});
