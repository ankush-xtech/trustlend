/**
 * Applies pending SQL migrations from ./drizzle/migrations. Forward-only and non-destructive:
 * it never drops data on its own. Uses DATABASE_URL_DIRECT (Neon non-pooled endpoint) when set.
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export async function runMigrations(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle/migrations" });
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1]?.includes("migrate");
if (isMain) {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL (or DATABASE_URL_DIRECT) is not set");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log("[migrate] migrations applied"))
    .catch((err) => {
      console.error("[migrate] failed:", err);
      process.exit(1);
    });
}
