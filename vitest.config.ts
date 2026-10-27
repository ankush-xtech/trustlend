import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

const serverOnlyStub = path.resolve(__dirname, "tests/support/empty-module.ts");

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: { alias: { "server-only": serverOnlyStub } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["tests/support/setup-unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/support/global-setup-integration.ts"],
          setupFiles: ["tests/support/setup-integration.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
          env: {
            APP_ENV: "test",
            DATABASE_URL: "postgres://postgres:postgres@localhost:54330/trustlend_it",
            DATABASE_DRIVER: "pg",
            APP_URL: "http://localhost:3000",
            EMAIL_PROVIDER: "dev",
            DEV_MAILBOX_DIR: ".test-artifacts/mailbox",
            STORAGE_DRIVER: "local",
            LOCAL_STORAGE_DIR: ".test-artifacts/storage",
            MALWARE_SCANNER: "signature",
            REQUIRE_EMAIL_VERIFICATION: "true",
            LOG_LEVEL: "error",
            MAX_UPLOAD_MB: "2",
          },
        },
      },
    ],
  },
});
