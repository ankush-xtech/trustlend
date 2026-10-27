import "server-only";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { logger } from "@/server/logger";
import * as schema from "./schema";
import { env } from "@/server/config/env";

/**
 * Both drivers expose the same Drizzle query API (including interactive transactions), so the rest
 * of the codebase is typed against the node-postgres flavour.
 *  - `pg`   : standard TCP connection (local Postgres, Neon direct/pooled TCP endpoints).
 *  - `neon` : Neon serverless driver over WebSockets (useful for serverless/edge-like runtimes).
 */
export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Transaction;

const globalForDb = globalThis as unknown as { __trustlendDb?: Database; __trustlendPool?: { end(): Promise<void> } };

function createDatabase(): Database {
  const config = env();
  if (config.DATABASE_DRIVER === "neon") {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: config.DATABASE_URL, max: config.DATABASE_POOL_MAX });
    // Idle-client errors (e.g. server restarts, failovers) must never crash the process.
    pool.on("error", (err: Error) => logger.error("database pool error", { error: err.message }));
    globalForDb.__trustlendPool = pool;
    return drizzleNeon({ client: pool, schema }) as unknown as Database;
  }
  const pool = new PgPool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    idleTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => logger.error("database pool error", { error: err.message }));
  globalForDb.__trustlendPool = pool;
  return drizzlePg({ client: pool, schema });
}

/** Lazily-initialised singleton (re-used across hot reloads in development). */
export function getDb(): Database {
  if (!globalForDb.__trustlendDb) globalForDb.__trustlendDb = createDatabase();
  return globalForDb.__trustlendDb;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export async function closeDb() {
  await globalForDb.__trustlendPool?.end();
  globalForDb.__trustlendPool = undefined;
  globalForDb.__trustlendDb = undefined;
}
