import "server-only";
import { NextResponse } from "next/server";
import { isAppError, RateLimitError } from "@/server/errors";
import { logger } from "@/server/logger";
import { env } from "@/server/config/env";
import { safeEqual } from "@/server/auth/crypto";

/** Consistent JSON error envelope for Route Handlers: { error: { code, message, fieldErrors? } }. */
export function errorResponse(err: unknown) {
  if (isAppError(err)) {
    const headers: Record<string, string> = {};
    if (err instanceof RateLimitError) headers["Retry-After"] = String(err.retryAfterSeconds);
    return NextResponse.json(
      { error: { code: err.code, message: err.message, fieldErrors: err.fieldErrors } },
      { status: err.status, headers },
    );
  }
  logger.error("route handler failed", { error: err });
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/**
 * CSRF defence for cookie-authenticated, state-changing Route Handlers: the request must come from our
 * own origin (Origin header, falling back to Sec-Fetch-Site). Server Actions have this built in.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new CsrfError();
    }
    const allowed = new Set([host, new URL(env().APP_URL).host].filter(Boolean));
    if (!allowed.has(originHost)) throw new CsrfError();
    return;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new CsrfError();
}

class CsrfError extends Error {}

export function csrfResponse() {
  return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-site request rejected." } }, { status: 403 });
}

export function isCsrfError(e: unknown) {
  return e instanceof CsrfError;
}

/** Bearer-token check for cron/background job endpoints (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export function isAuthorizedJob(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}
