import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Migrations use DATABASE_URL_DIRECT when provided (Neon: the non-pooled endpoint),
 * falling back to DATABASE_URL.
 */
export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || "",
  },
  strict: true,
  verbose: true,
});
