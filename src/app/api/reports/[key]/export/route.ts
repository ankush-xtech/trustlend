import { NextResponse, type NextRequest } from "next/server";
import { getCurrentActor } from "@/server/auth/current";
import { requirePermission } from "@/server/rbac/authorize";
import { auditActor } from "@/server/rbac/actor";
import { REPORTS, runReport, toCsv, type ReportKey } from "@/server/services/reports";
import { recordAudit } from "@/server/services/audit";
import { consumeRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { db } from "@/server/db/client";
import { isAppError, RateLimitError } from "@/server/errors";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

function errorJson(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Authorized, rate-limited, audited CSV export with formula-injection protection (see toCsv). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return errorJson(401, "UNAUTHENTICATED", "Please sign in to continue.");
    requirePermission(actor, "reports.read", "reports.export");
    const { key } = await params;
    if (!(key in REPORTS)) return errorJson(404, "NOT_FOUND", "Unknown report.");
    await consumeRateLimit(RATE_LIMITS.export, actor.userId);
    const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const range = { from: date(request.nextUrl.searchParams.get("from")), to: date(request.nextUrl.searchParams.get("to")) };
    const data = await runReport(actor, key as ReportKey, range);
    await recordAudit(db, {
      actor: auditActor(actor),
      action: "report.exported",
      entityType: "report",
      entityId: key,
      after: { ...range, rows: data.rows.length },
    });
    const filename = `trustlend-${key}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(`﻿${toCsv(data.columns, data.rows)}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof RateLimitError) return errorJson(429, err.code, err.message, { "Retry-After": String(err.retryAfterSeconds) });
    if (isAppError(err)) return errorJson(err.status, err.code, err.message);
    logger.error("report export failed", { error: err });
    return errorJson(500, "INTERNAL", "Something went wrong.");
  }
}
