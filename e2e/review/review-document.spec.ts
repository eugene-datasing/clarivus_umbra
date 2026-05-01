import { test, expect } from "@playwright/test";
import { SEED } from "../fixtures/test-data";

/**
 * Slice D1 (April 2026) — migrated to the pdf.js viewer + PNCC seed.
 * Runs in the `chromium-admin-pdf-review` Playwright project, which
 * flips VIEWER_MODE='pdf' via a setup project before this suite runs
 * and restores the default after via the matching teardown.
 *
 * Assertions prefer count-based or type-based checks over specific
 * detection text — count is robust to AI re-extraction across
 * reprocesses; type is robust because detection types are pipeline-
 * defined enum values. Specific text appears only where the assertion
 * intent demands it (verifying the document name renders), and even
 * then we use a regex stem so version-tag/file-name churn doesn't
 * break the spec.
 */
test.describe("Document Review (PDF view)", () => {
  const reviewUrl = `/batches/${SEED.documents.mainCaseFile.batchId}/review/${SEED.documents.mainCaseFile.id}`;

  test("renders the review page with document name", async ({ page }) => {
    await page.goto(reviewUrl);
    // Document name is "04_main_case_file_long.docx" — assert on the
    // stable stem, tolerant of any extension/version drift.
    await expect(page.locator("body")).toContainText(/04_main_case_file_long/);
  });

  test("renders the PdfViewer (canvas + per-page wrappers visible)", async ({ page }) => {
    await page.goto(reviewUrl);
    // The pdf.js text-layer + canvas should mount under VIEWER_MODE='pdf'.
    await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible({ timeout: 30_000 });
  });

  test("displays at least one detection in the sidebar", async ({ page }) => {
    await page.goto(reviewUrl);
    // Sidebar contains pending/redacted/cleared rows. Assert at least
    // one Redact-or-Reject button group appears (count-based).
    const redactButtons = page.getByRole("button", { name: /redact/i });
    await expect(redactButtons.first()).toBeVisible({ timeout: 10_000 });
    expect(await redactButtons.count()).toBeGreaterThanOrEqual(1);
  });

  test("shows detection types from the pipeline-defined set", async ({ page }) => {
    await page.goto(reviewUrl);
    // The pipeline emits typed detections — at least one of these
    // pattern-stable types should render in a sidebar tag/badge.
    const body = await page.locator("body").textContent();
    const hasStableType = /personal[- ]?name|phone|email|ird|nhi|bank/i.test(body ?? "");
    expect(hasStableType).toBeTruthy();
  });

  test("shows confidence percentages on detections", async ({ page }) => {
    await page.goto(reviewUrl);
    // Confidence badges show "%" alongside detection rows. Robust to
    // exact-percentage drift across reprocesses.
    await expect(page.locator("body")).toContainText(/\d+%/);
  });

  test("shows LGOIMA section references in suggested grounds", async ({ page }) => {
    await page.goto(reviewUrl);
    await expect(page.locator("body")).toContainText(/s7\(2\)/i);
  });

  test("renders Redact button on at least one pending detection", async ({ page }) => {
    await page.goto(reviewUrl);
    const redactBtn = page.getByRole("button", { name: /redact/i }).first();
    await expect(redactBtn).toBeVisible({ timeout: 10_000 });
  });

  test("renders Reject button on at least one pending detection", async ({ page }) => {
    await page.goto(reviewUrl);
    const rejectBtn = page.getByRole("button", { name: /reject/i }).first();
    await expect(rejectBtn).toBeVisible({ timeout: 10_000 });
  });

  test("renders detection overlay buttons on the canonical PDF", async ({ page }) => {
    await page.goto(reviewUrl);
    // Slice A promoted overlay rectangles to <button role="button">
    // with aria-label="<type>: <text>". Slice B keeps that on the
    // left panel under dual-panel.
    const overlayBtns = page.locator('[data-panel="original"] button[role="button"][aria-label*=": "]');
    await expect(overlayBtns.first()).toBeVisible({ timeout: 30_000 });
    expect(await overlayBtns.count()).toBeGreaterThanOrEqual(1);
  });

  test("Option C banner is NOT shown for a text-selectable canonical", async ({ page }) => {
    await page.goto(reviewUrl);
    await page.waitForTimeout(2000);
    expect(await page.locator('[data-option-c-banner="true"]').count()).toBe(0);
  });

  test("Option C banner IS shown for a text-less canonical (scanned-sim)", async ({ page }) => {
    const scannedUrl = `/batches/${SEED.documents.scannedSim.batchId}/review/${SEED.documents.scannedSim.id}`;
    await page.goto(scannedUrl);
    // Match by the banner copy rather than the data attribute — under
    // production webpack, Playwright's locator on `[data-...="..."]` is
    // sometimes finicky on hydration boundaries; the visible text is
    // a more robust signal that Option C routing fired.
    await expect(page.locator("body")).toContainText(
      /doesn(['’])t have selectable text/i,
      { timeout: 15_000 },
    );
    await expect(page.locator("body")).toContainText(/scanned or image-only/i);
  });

  test("HTML branch renders for a doc with null canonicalPdfPath", async ({ page }) => {
    const nullCanonUrl = `/batches/${SEED.documents.employmentAgreement.batchId}/review/${SEED.documents.employmentAgreement.id}`;
    await page.goto(nullCanonUrl);
    await page.waitForTimeout(2000);
    // Slice A routing falls back to HTML when canonicalPdfPath is null —
    // independently of the flag — so even with VIEWER_MODE='pdf' active
    // for this project, the PdfViewer should not mount here.
    expect(await page.locator(".react-pdf__Page").count()).toBe(0);
    // Banner should NOT show (this is null-canonical, not text-less)
    expect(await page.locator('[data-option-c-banner="true"]').count()).toBe(0);
  });
});
