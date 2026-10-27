import "server-only";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

export interface RequestMeta {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Best-effort request metadata for audit logs and rate limiting.
 * Falls back gracefully outside a request scope (scripts, tests).
 */
export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    const forwarded = process.env.TRUST_PROXY_HEADERS === "false" ? null : h.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return {
      requestId: h.get("x-request-id") || h.get("x-vercel-id") || randomUUID(),
      ipAddress: ip,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    return { requestId: randomUUID(), ipAddress: null, userAgent: null };
  }
}
