import "server-only";
import { and, eq, lt, ne } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { env } from "@/server/config/env";
import { generateToken, sha256Hex } from "./crypto";

/**
 * Database-backed sessions (pattern from the Lucia v3 / "Copenhagen Book" guidance):
 *  - The cookie holds a 256-bit random token; the DB stores only sha256(token).
 *  - Absolute expiry (SESSION_TTL_HOURS) + idle timeout (SESSION_IDLE_TIMEOUT_HOURS).
 *  - Every validation re-checks the user's status, so disabled users are cut off immediately.
 */

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function sessionCookieName() {
  return env().APP_URL.startsWith("https://") ? "__Host-tl_session" : "tl_session";
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(userId: string, meta: { ipAddress: string | null; userAgent: string | null }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600 * 1000);
  await db.insert(sessions).values({
    id: sha256Hex(token),
    userId,
    expiresAt,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return { token, expiresAt };
}

export interface ValidatedSession {
  sessionId: string;
  userId: string;
  expiresAt: Date;
}

export async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  if (!token || token.length > 100) return null;
  const id = sha256Hex(token);
  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      userStatus: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  const idleLimit = env().SESSION_IDLE_TIMEOUT_HOURS * 3600 * 1000;
  if (row.expiresAt.getTime() <= now || row.lastSeenAt.getTime() + idleLimit <= now || row.userStatus !== "ACTIVE") {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, id));
  }
  return { sessionId: row.id, userId: row.userId, expiresAt: row.expiresAt };
}

export async function invalidateSession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateSessionToken(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

/** Revoke every session of a user (password reset, deactivation), optionally keeping one. */
export async function invalidateUserSessions(userId: string, conn: DbOrTx = db, exceptSessionId?: string) {
  await conn
    .delete(sessions)
    .where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId));
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
