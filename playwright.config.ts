import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * Slice D1 (April 2026) added a dedicated `chromium-admin-pdf-review`
 * project for the two review specs whose assertions exercise the
 * pdf.js viewer (review-document.spec.ts, review-actions.spec.ts).
 * That project depends on a setup that flips VIEWER_MODE='pdf' before
 * the suite runs, with a teardown that restores the default after.
 *
 * `chromium-admin` and `chromium-reviewer` exclude these two specs
 * via testIgnore so they run only in the PDF-review project, keeping
 * VIEWER_MODE='html' for everything else (matching the production
 * default until Slice D2 flips it).
 */
const REVIEW_PDF_SPECS = /e2e\/review\/review-(document|actions)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Setup project — authenticates all roles and saves storage state
    { name: "setup", testDir: "./e2e", testMatch: /global-setup\.ts/ },

    // VIEWER_MODE setup/teardown for the PDF-review suite. The setup
    // flips the flag to "pdf"; the teardown restores the default after
    // the dependent project finishes. Both run a single helper test.
    {
      name: "set-viewer-mode-pdf",
      testMatch: /helpers\/set-viewer-mode-pdf\.setup\.ts/,
      teardown: "set-viewer-mode-default",
    },
    {
      name: "set-viewer-mode-default",
      testMatch: /helpers\/set-viewer-mode-default\.teardown\.ts/,
    },

    // Chromium tests — authenticated as admin (default VIEWER_MODE='html')
    {
      name: "chromium-admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
      testIgnore: [/global-setup\.ts/, /helpers\//, REVIEW_PDF_SPECS],
    },

    // Chromium tests — authenticated as reviewer (default VIEWER_MODE='html')
    {
      name: "chromium-reviewer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/reviewer.json",
      },
      dependencies: ["setup"],
      testMatch: /\/(review|dashboard|queue)\//,
      testIgnore: [/global-setup\.ts/, /helpers\//, REVIEW_PDF_SPECS],
    },

    // Chromium tests — authenticated as admin AND VIEWER_MODE='pdf'.
    // Scoped to the two review specs whose assertions exercise the
    // pdf.js viewer (overlay buttons, canonical PDF rendering,
    // sidebar wired against a PDF target). The setup project flips
    // the flag before any spec here runs; the teardown restores the
    // default once the suite completes.
    {
      name: "chromium-admin-pdf-review",
      use: {
        ...devices["Desktop Chrome"],
        // Wider than DUAL_PANEL_MIN_WIDTH (1280px content area) so the
        // left panel renders alongside the right under Slice B's
        // dual-panel layout. The default 1280×720 viewport leaves the
        // content area below threshold (sidebar takes ~240px), which
        // hides the left panel via display:none and breaks selectors
        // that target the first canvas.
        viewport: { width: 1920, height: 1080 },
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup", "set-viewer-mode-pdf"],
      testMatch: REVIEW_PDF_SPECS,
    },
  ],

  // Slice D1 — switched from `npm run dev` (webpack) to a production
  // build + start. `next dev` (webpack mode) crashes the pdfjs-dist
  // module init with "TypeError: Object.defineProperty called on
  // non-object" when the PdfViewer tries to mount, which means the
  // review-PDF project's specs (`chromium-admin-pdf-review`) can't
  // exercise the PDF view at all in dev mode. Production webpack
  // handles the same module graph cleanly (Slice A's prod-smoke
  // confirmed it). The first `npm run build` adds ~30s to startup;
  // `reuseExistingServer: !CI` keeps that cost off subsequent local
  // re-runs as long as the previous server is still up. Slice D-
  // followup item: investigate switching dev to turbopack as default
  // and resolving the applicationinsights compile-overlay friction
  // separately. Out of scope for this PR.
  webServer: {
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
