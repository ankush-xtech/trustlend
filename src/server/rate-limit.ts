import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { sha256Hex } from "@/server/auth/crypto";
import { RateLimitError } from "@/server/errors";

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  loginByIdentifier: { bucket: "login:id", limit: 10, windowSeconds: 15 * 60 },
  loginByIp: { bucket: "login:ip", limit: 40, windowSeconds: 15 * 60 },
  register: { bucket: "register:ip", limit: 10, windowSeconds: 60 * 60 },
  passwordReset: { bucket: "pwreset", limit: 5, windowSeconds: 60 * 60 },
  verificationEmail: { bucket: "verify", limit: 5, windowSeconds: 60 * 60 },
  upload: { bucket: "upload", limit: 60, windowSeconds: 60 * 60 },
  download: { bucket: "download", limit: 300, windowSeconds: 60 * 60 },
  contact: { bucket: "contact", limit: 5, windowSeconds: 60 * 60 },
  export: { bucket: "export", limit: 30, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter stored in Postgres. Identifiers (emails, IPs) are hashed so the table holds no PII.
 * Throws RateLimitError when the limit is exceeded.
 */
export async function consumeRateLimit(rule: RateLimitRule, identifier: string | null | undefined) {
  if (!identifier) return;
  const key = `${rule.bucket}:${sha256Hex(identifier.toLowerCase()).slice(0, 40)}`;
  const result = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${rule.windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${rule.windowSeconds}) then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = result.rows[0];
  if (row && Number(row.count) > rule.limit) {
    const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
    throw new RateLimitError(Math.max(1, Math.ceil(rule.windowSeconds - elapsed)));
  }
}

export async function resetRateLimit(rule: RateLimitRule, identifier: string) {
  const key = `${rule.bucket}:${sha256Hex(identifier.toLowerCase()).slice(0, 40)}`;
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}
