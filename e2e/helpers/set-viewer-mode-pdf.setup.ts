/**
 * Setup project — runs once before the chromium-admin-pdf-review
 * suite to flip VIEWER_MODE='pdf' so review-area specs exercise the
 * pdf.js viewer rather than the HTML reconstruction branch.
 *
 * Paired with set-viewer-mode-default.teardown.ts which restores
 * the default after the review suite finishes.
 */
import { test as setup } from "@playwright/test";
import { setViewerMode } from "./viewer-mode";

setup("set VIEWER_MODE=pdf for review specs", async () => {
  await setViewerMode("pdf");
});
