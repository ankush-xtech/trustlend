import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { env } from "@/server/config/env";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/** Liveness + database readiness. Reports integration modes without exposing secrets. */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    const e = env();
    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        latencyMs: Date.now() - started,
        environment: e.APP_ENV,
        integrations: {
          email: e.EMAIL_PROVIDER === "resend" ? "resend" : "dev-mailbox (not delivered)",
          storage: e.STORAGE_DRIVER,
          malwareScanner: e.MALWARE_SCANNER,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("health check failed", { error: err });
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
