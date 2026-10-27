import "server-only";
import { after } from "next/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db/client";
import { notifications, users } from "@/server/db/schema";
import { getEmailProvider } from "@/server/email/provider";
import type { RenderedEmail } from "@/server/email/templates";
import { env } from "@/server/config/env";
import { logger } from "@/server/logger";
import type { Actor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";

const MAX_ATTEMPTS = 5;

export function appUrl(pathname: string) {
  return new URL(pathname, env().APP_URL).toString();
}

interface EnqueueBase {
  template: string;
  email: RenderedEmail;
  entityType?: string;
  entityId?: string;
  linkPath?: string;
  /** Idempotency key: the same logical event never produces two messages. */
  dedupeKey?: string;
}

/** Queue an email in the outbox (inside the caller's transaction). Delivery happens asynchronously. */
export async function enqueueEmail(
  tx: DbOrTx,
  p: EnqueueBase & { to: string; userId?: string | null; containsSecret?: boolean },
) {
  await tx
    .insert(notifications)
    .values({
      userId: p.userId ?? null,
      channel: "EMAIL",
      template: p.template,
      toEmail: p.to,
      subject: p.email.subject,
      body: p.email.text,
      containsSecret: p.containsSecret ?? false,
      entityType: p.entityType,
      entityId: p.entityId,
      linkPath: p.linkPath,
      dedupeKey: p.dedupeKey ? `email:${p.dedupeKey}` : null,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

/** Notify a platform user: in-app inbox entry + email. */
export async function notifyUser(tx: DbOrTx, userId: string, p: EnqueueBase & { inAppText?: string }) {
  const [user] = await tx.select({ email: users.email, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;
  await tx
    .insert(notifications)
    .values({
      userId,
      channel: "IN_APP",
      template: p.template,
      subject: p.email.subject,
      body: p.inAppText ?? null,
      linkPath: p.linkPath,
      entityType: p.entityType,
      entityId: p.entityId,
      status: "SENT",
      sentAt: new Date(),
      dedupeKey: p.dedupeKey ? `inapp:${p.dedupeKey}` : null,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey });
  if (user.status === "ACTIVE") {
    await enqueueEmail(tx, { ...p, to: user.email, userId });
  }
}

/**
 * Outbox dispatcher. Claims due emails with SKIP LOCKED so concurrent workers never double-send,
 * and passes the notification id as the provider idempotency key so a crash-and-retry is safe.
 */
export async function dispatchPendingEmails(limit = 25) {
  const claimed = await db.execute<{ id: string; to_email: string; subject: string; body: string | null; contains_secret: boolean }>(sql`
    update notifications set status = 'SENDING', attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes'
    where id in (
      select id from notifications
      where channel = 'EMAIL'
        and attempts < ${MAX_ATTEMPTS}
        and ((status in ('PENDING','FAILED') and next_attempt_at <= now()) or (status = 'SENDING' and next_attempt_at <= now()))
      order by created_at
      for update skip locked
      limit ${limit}
    )
    returning id, to_email, subject, body, contains_secret
  `);
  const provider = getEmailProvider();
  let sent = 0;
  let failed = 0;
  for (const row of claimed.rows) {
    try {
      const result = await provider.send({ to: row.to_email, subject: row.subject, text: row.body ?? "", idempotencyKey: row.id });
      await db
        .update(notifications)
        .set({
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: `${provider.name}:${result.messageId}`,
          lastError: null,
          ...(row.contains_secret ? { body: null } : {}),
        })
        .where(eq(notifications.id, row.id));
      sent++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message.slice(0, 500) : "send failed";
      logger.warn("email delivery failed", { notificationId: row.id, error: message });
      await db
        .update(notifications)
        .set({
          status: "FAILED",
          lastError: message,
          nextAttemptAt: sql`now() + (power(2, ${notifications.attempts}) * interval '1 minute')`,
        })
        .where(eq(notifications.id, row.id));
    }
  }
  return { claimed: claimed.rows.length, sent, failed, provider: provider.name, delivers: provider.delivers };
}

/** Fire-and-forget dispatch after the response (best effort; the cron job is the reliable path). */
export function scheduleDispatch() {
  try {
    after(async () => {
      try {
        await dispatchPendingEmails();
      } catch (err) {
        logger.warn("post-response email dispatch failed", { error: err instanceof Error ? err.message : String(err) });
      }
    });
  } catch {
    // Outside a request scope (scripts/tests): the cron dispatcher will deliver the email.
  }
}

// ---------------------------------------------------------------- in-app inbox

export async function listMyNotifications(actor: Actor, limit = 30) {
  return db
    .select({
      id: notifications.id,
      subject: notifications.subject,
      body: notifications.body,
      linkPath: notifications.linkPath,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), eq(notifications.channel, "IN_APP")))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnread(actor: Actor) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), eq(notifications.channel, "IN_APP"), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function markNotificationsRead(actor: Actor, ids: string[] | "all") {
  const base = and(eq(notifications.userId, actor.userId), eq(notifications.channel, "IN_APP"), isNull(notifications.readAt));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(ids === "all" ? base : and(base, inArray(notifications.id, ids.slice(0, 100))));
}

// ---------------------------------------------------------------- admin log

export async function listNotificationLog(
  actor: Actor,
  opts: { status?: string; channel?: string; q?: string; page?: number; pageSize?: number },
) {
  requirePermission(actor, "notifications.read_all");
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const page = Math.max(opts.page ?? 1, 1);
  const conds = [];
  if (opts.status) conds.push(sql`${notifications.status} = ${opts.status}`);
  if (opts.channel) conds.push(sql`${notifications.channel} = ${opts.channel}`);
  if (opts.q) conds.push(sql`(${notifications.toEmail} ilike ${"%" + opts.q + "%"} or ${notifications.template} ilike ${"%" + opts.q + "%"})`);
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: notifications.id,
      channel: notifications.channel,
      template: notifications.template,
      toEmail: notifications.toEmail,
      subject: notifications.subject,
      status: notifications.status,
      attempts: notifications.attempts,
      lastError: notifications.lastError,
      sentAt: notifications.sentAt,
      providerMessageId: notifications.providerMessageId,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(where);
  return { rows, total, page, pageSize, provider: getEmailProvider().name, delivers: getEmailProvider().delivers };
}

export async function retryNotification(actor: Actor, id: string) {
  requirePermission(actor, "notifications.read_all");
  await db
    .update(notifications)
    .set({ status: "PENDING", attempts: 0, nextAttemptAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.status, "FAILED")));
}
