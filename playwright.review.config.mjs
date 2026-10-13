import { defineConfig, devices } from "@playwright/test";

const reviewBaseUrl = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./review-e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: ".erp-local-storage/e2e/review-test-results",
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: ".erp-local-storage/e2e/review-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: ".erp-local-storage/e2e/review-report", open: "never" }]],
  use: {
    baseURL: reviewBaseUrl,
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: {
    command: "npm run review:dev",
    url: reviewBaseUrl,
    env: {
      ERP_LOCAL_STORAGE_DIR: ".erp-local-storage/e2e/review-runtime",
    },
    timeout: 60_000,
    reuseExistingServer: true,
  },
});
