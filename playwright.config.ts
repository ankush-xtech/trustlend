import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a PRODUCTION build (`next build` + `next start`) on port 3100 using a
 * dedicated database (trustlend_e2e) that is reset and seeded by tests/e2e/global-setup.ts.
 * Requires the local PostgreSQL (`npm run db:local`) or E2E_DATABASE_URL pointing at a disposable database.
 */
const PORT = 3100;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54320/trustlend_e2e";

export const E2E_ENV = {
  APP_ENV: "test",
  APP_URL: `http://localhost:${PORT}`,
  DATABASE_URL,
  DATABASE_DRIVER: "pg",
  EMAIL_PROVIDER: "dev",
  DEV_MAILBOX_DIR: ".test-artifacts/e2e-mailbox",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: ".test-artifacts/e2e-storage",
  MALWARE_SCANNER: "signature",
  REQUIRE_EMAIL_VERIFICATION: "true",
  MAX_UPLOAD_MB: "10",
  CRON_SECRET: "e2e-cron-secret-0123456789abcdef0123456789",
  LOG_LEVEL: "warn",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? `npx next start -p ${PORT}` : `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 600_000,
    reuseExistingServer: false,
    env: E2E_ENV,
    stdout: "pipe",
    stderr: "pipe",
  },
});
