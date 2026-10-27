import "server-only";
import { z } from "zod";
import { db } from "@/server/db/client";
import { systemSettings } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "./audit";
import { ValidationError } from "@/server/errors";

/** Registry of runtime-configurable platform settings (validated, typed, audited). */
export const SETTINGS = {
  "referral.attributionWindowDays": {
    label: "Referral attribution window (days)",
    description:
      "A customer's self-started application is attributed to their referring agent if the active referral is younger than this many days.",
    schema: z.coerce.number().int().min(0).max(3650),
    default: 90,
  },
  "applications.maxOpenPerCustomer": {
    label: "Maximum open applications per customer",
    description: "Open = any status other than withdrawn, rejected, closed or disbursed.",
    schema: z.coerce.number().int().min(1).max(20),
    default: 3,
  },
  "documents.requireCleanScan": {
    label: "Require a clean malware scan before verification",
    description: "When enabled, documents that were not scanned (or failed scanning) cannot be marked verified.",
    schema: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
    default: false,
  },
  "support.contactEmail": {
    label: "Public support email",
    description: "Shown on the contact page.",
    schema: z.string().trim().max(200),
    default: "support@example.com",
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]["default"];

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const all = await getAllSettings();
  return all[key];
}

export async function getAllSettings(): Promise<{ [K in SettingKey]: SettingValue<K> }> {
  const rows = await db.select().from(systemSettings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<string, unknown>;
  for (const [key, def] of Object.entries(SETTINGS)) {
    const parsed = def.schema.safeParse(map.has(key) ? map.get(key) : def.default);
    out[key] = parsed.success ? parsed.data : def.default;
  }
  return out as { [K in SettingKey]: SettingValue<K> };
}

export async function updateSettings(actor: Actor, input: Record<string, unknown>) {
  requirePermission(actor, "settings.manage");
  const current = await getAllSettings();
  const changes: Record<string, unknown> = {};
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    if (!(key in input)) continue;
    const parsed = def.schema.safeParse(input[key]);
    if (!parsed.success) {
      fieldErrors[key] = [parsed.error.issues[0]?.message ?? "Invalid value"];
      continue;
    }
    if (parsed.data !== current[key as SettingKey]) changes[key] = parsed.data;
  }
  if (Object.keys(fieldErrors).length) throw new ValidationError(undefined, fieldErrors);
  if (!Object.keys(changes).length) return;
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(changes)) {
      await tx
        .insert(systemSettings)
        .values({ key, value, updatedById: actor.userId, updatedAt: new Date() })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedById: actor.userId, updatedAt: new Date() } });
    }
    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, current[k as SettingKey]]));
    await recordAudit(tx, { actor: auditActor(actor), action: "settings.update", entityType: "system_settings", before, after: changes });
  });
}
