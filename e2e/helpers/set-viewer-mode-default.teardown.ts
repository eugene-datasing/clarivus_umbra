/**
 * Teardown project — runs after chromium-admin-pdf-review finishes,
 * deletes the VIEWER_MODE row so subsequent runs (and the dev demo)
 * see the default "html". Paired with set-viewer-mode-pdf.setup.ts.
 */
import { test as teardown } from "@playwright/test";
import { setViewerMode } from "./viewer-mode";

teardown("restore VIEWER_MODE default after review specs", async () => {
  await setViewerMode(null);
});
