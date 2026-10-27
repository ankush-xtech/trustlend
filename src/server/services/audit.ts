import "server-only";
import { auditLogs } from "@/server/db/schema";
import type { DbOrTx } from "@/server/db/client";
import { getRequestMeta } from "@/server/request-context";

export interface AuditActor {
  userId: string;
  email: string;
}

export interface AuditEntry {
  actor: AuditActor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Keys that must never be persisted in audit snapshots. */
const FORBIDDEN_KEYS = /password|token|hash|secret|identityNumber|storageKey|body/i;

function sanitize(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/**
 * Writes an append-only audit record. Call inside the same transaction as the change it describes
 * so the audit trail can never disagree with the data.
 */
export async function recordAudit(tx: DbOrTx, entry: AuditEntry) {
  const meta = await getRequestMeta();
  await tx.insert(auditLogs).values({
    actorId: entry.actor?.userId ?? null,
    actorEmail: entry.actor?.email ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: sanitize(entry.before),
    after: sanitize(entry.after),
    reason: entry.reason ?? null,
    requestId: meta.requestId,
    ipAddress: meta.ipAddress,
  });
}
