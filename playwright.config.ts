import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

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

    // Chromium tests — authenticated as admin
    {
      name: "chromium-admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
      testIgnore: /global-setup\.ts/,
    },

    // Chromium tests — authenticated as reviewer
    {
      name: "chromium-reviewer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/reviewer.json",
      },
      dependencies: ["setup"],
      testMatch: /\/(review|dashboard|queue)\//,
      testIgnore: /global-setup\.ts/,
    },
  ],

  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
