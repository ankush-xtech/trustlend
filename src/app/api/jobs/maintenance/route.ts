import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { purgeExpiredSessions } from "@/server/auth/session";
import { errorResponse, isAuthorizedJob } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping: expired sessions, used/expired auth tokens, stale rate-limit windows, and bodies of
 * delivered secret-bearing emails. Never touches business, financial or audit records.
 */
async function handle(request: Request) {
  if (!isAuthorizedJob(request)) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }, { status: 401 });
  try {
    await purgeExpiredSessions();
    const tokens = await db.execute(sql`delete from auth_tokens where expires_at < now() - interval '7 days' or (used_at is not null and used_at < now() - interval '7 days')`);
    const limits = await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
    const bodies = await db.execute(sql`update notifications set body = null where contains_secret and body is not null and created_at < now() - interval '2 days'`);
    return NextResponse.json({ ok: true, tokensDeleted: tokens.rowCount, rateLimitsDeleted: limits.rowCount, secretBodiesCleared: bodies.rowCount });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = handle;
export const POST = handle;
