/**
 * Local development PostgreSQL using real PostgreSQL binaries (embedded-postgres).
 * No Docker required. Data persists in ./.pgdata. Development/test use only.
 *
 *   npm run db:local          # start and keep running (Ctrl+C to stop)
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import path from "node:path";
import fs from "node:fs";

const PORT = Number(process.env.LOCAL_PG_PORT ?? 54320);
const DATA_DIR = path.resolve(process.env.LOCAL_PG_DIR ?? ".pgdata");
const DATABASES = (process.env.LOCAL_PG_DATABASES ?? "trustlend,trustlend_test,trustlend_e2e").split(",");

export async function startLocalPostgres(opts: { port?: number; dataDir?: string; databases?: string[] } = {}) {
  const port = opts.port ?? PORT;
  const dataDir = opts.dataDir ?? DATA_DIR;
  const databases = opts.databases ?? DATABASES;
  const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    // Always UTF-8 (Neon/production default) regardless of the host OS locale.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });
  if (fresh) await server.initialise();
  await server.start();
  const client = new pg.Client({ connectionString: `postgres://postgres:postgres@localhost:${port}/postgres` });
  await client.connect();
  for (const name of databases) {
    const exists = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (exists.rowCount === 0) await client.query(`create database "${name.replace(/"/g, "")}" encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`);
  }
  await client.end();
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes("local-db");
if (isMain) {
  startLocalPostgres()
    .then((server) => {
      console.log(`[local-db] PostgreSQL running on postgres://postgres:postgres@localhost:${PORT}`);
      console.log(`[local-db] Databases: ${DATABASES.join(", ")}  (data: ${DATA_DIR})`);
      const shutdown = async () => {
        console.log("\n[local-db] stopping...");
        await server.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      console.error("[local-db] failed to start:", err);
      process.exit(1);
    });
}
