import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { notificationChannel, notificationStatus } from "./enums";
import { users } from "./identity";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Notification outbox + in-app inbox. Business transactions insert rows here; a background
 * dispatcher delivers PENDING emails so slow providers never block critical transactions.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    channel: notificationChannel("channel").notNull(),
    template: text("template").notNull(),
    toEmail: text("to_email"),
    subject: text("subject").notNull(),
    /** Body text. Cleared after delivery when `containsSecret` (e.g. reset links). */
    body: text("body"),
    containsSecret: boolean("contains_secret").notNull().default(false),
    /** Link target inside the app for in-app notifications (relative path only). */
    linkPath: text("link_path"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    status: notificationStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    providerMessageId: text("provider_message_id"),
    sentAt: ts("sent_at"),
    readAt: ts("read_at"),
    /** Idempotency key so retries of the triggering operation do not create duplicate messages. */
    dedupeKey: text("dedupe_key"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_unique").on(t.dedupeKey),
    index("notifications_dispatch_idx").on(t.status, t.nextAttemptAt),
    index("notifications_user_idx").on(t.userId, t.createdAt),
  ],
);

/** Append-only audit trail (enforced by a database trigger). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    reason: text("reason"),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_actor_idx").on(t.actorId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
