/**
 * Resets the E2E database (migrations + illustrative seed) before the run. Starts the local
 * embedded PostgreSQL if it is not already running. Never point this at a real database.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { E2E_ENV } from "../../playwright.config";
import { startLocalPostgres } from "../../scripts/local-db";
import { runMigrations } from "../../scripts/migrate";

export default async function globalSetup() {
  const url = new URL(E2E_ENV.DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !process.env.E2E_ALLOW_REMOTE_DB) {
    throw new Error("Refusing to reset a non-local E2E database. Set E2E_ALLOW_REMOTE_DB=1 for a disposable remote database.");
  }
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(E2E_ENV.DATABASE_URL);
  adminUrl.pathname = "/postgres";

  let client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch {
    await startLocalPostgres({ port: Number(url.port || 5432), databases: [] });
    client = new pg.Client({ connectionString: adminUrl.toString() });
    await client.connect();
  }
  const exists = await client.query("select 1 from pg_database where datname = $1", [dbName]);
  if (exists.rowCount === 0) {
    await client.query(`create database "${dbName}" encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`);
  }
  await client.end();

  // Playwright starts the web server before global setup, so reset the schema in place
  // (dropping the database would terminate the server's pooled connections).
  const target = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL });
  await target.connect();
  await target.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await target.end();
  await runMigrations(E2E_ENV.DATABASE_URL);
  for (const dir of [E2E_ENV.DEV_MAILBOX_DIR, E2E_ENV.LOCAL_STORAGE_DIR]) fs.rmSync(path.resolve(dir), { recursive: true, force: true });

  execFileSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "--conditions=react-server", "scripts/seed.ts"], {
    env: { ...process.env, ...E2E_ENV },
    stdio: "inherit",
  });
}
