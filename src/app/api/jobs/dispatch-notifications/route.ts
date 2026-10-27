import { NextResponse } from "next/server";
import { dispatchPendingEmails } from "@/server/services/notifications";
import { errorResponse, isAuthorizedJob } from "@/server/http";

export const dynamic = "force-dynamic";

/** Outbox dispatcher. Triggered by Vercel Cron (GET with Bearer CRON_SECRET) or any scheduler. */
async function handle(request: Request) {
  if (!isAuthorizedJob(request)) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }, { status: 401 });
  try {
    const result = await dispatchPendingEmails(50);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = handle;
export const POST = handle;
