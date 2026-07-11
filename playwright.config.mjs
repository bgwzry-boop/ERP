import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.ERP_E2E_API_PORT ?? 18787);
const appPort = Number(process.env.ERP_E2E_APP_PORT ?? 15174);
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;
const appBaseUrl = `http://127.0.0.1:${appPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: ".erp-local-storage/e2e/test-results",
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: ".erp-local-storage/e2e/report", open: "never" }]]
    : [["list"], ["html", { outputFolder: ".erp-local-storage/e2e/report", open: "never" }]],
  use: {
    baseURL: appBaseUrl,
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
  webServer: [
    {
      command: "node scripts/run-core-browser-e2e-api.mjs",
      url: `${apiBaseUrl}/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        ERP_E2E_API_PORT: String(apiPort),
      },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${appPort} --strictPort`,
      url: appBaseUrl,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        VITE_ERP_API_BASE_URL: apiBaseUrl,
        VITE_ERP_RUNTIME_MODE: "test",
      },
    },
  ],
});
