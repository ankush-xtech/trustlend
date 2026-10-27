/**
 * Integration tests run against a real PostgreSQL (embedded-postgres, port 54330, data in .pgdata-test).
 * A fresh database is created for every run and all migrations are applied.
 */
import path from "node:path";
import fs from "node:fs";
import pg from "pg";
import { startLocalPostgres } from "../../scripts/local-db";
import { runMigrations } from "../../scripts/migrate";

const PORT = 54330;
const DB = "trustlend_it";

export default async function setup() {
  const server = await startLocalPostgres({ port: PORT, dataDir: path.resolve(".pgdata-test"), databases: [] });
  const admin = new pg.Client({ connectionString: `postgres://postgres:postgres@localhost:${PORT}/postgres` });
  await admin.connect();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`);
  await admin.end();
  await runMigrations(`postgres://postgres:postgres@localhost:${PORT}/${DB}`);
  fs.rmSync(path.resolve(".test-artifacts"), { recursive: true, force: true });
  return async () => {
    await server.stop();
  };
}
