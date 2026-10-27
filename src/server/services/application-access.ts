import "server-only";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { applicationAssignments, customers, loanApplications } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { applicationViewLevel, type AppViewLevel, type ApplicationAccessFacts } from "@/server/rbac/application-access";
import { NotFoundError } from "@/server/errors";

export type ApplicationRow = typeof loanApplications.$inferSelect;

export interface LoadedApplication {
  app: ApplicationRow;
  facts: ApplicationAccessFacts;
  customer: { id: string; userId: string | null; fullName: string; email: string; mobile: string };
}

/**
 * Loads an application with the facts needed for authorization. With `lock`, the application row is
 * locked FOR UPDATE for the rest of the transaction (serializes concurrent workflow operations).
 */
export async function loadApplication(conn: DbOrTx, applicationId: string, opts: { lock?: boolean } = {}): Promise<LoadedApplication> {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) throw new NotFoundError();
  const base = conn
    .select({ app: loanApplications, customer: { id: customers.id, userId: customers.userId, fullName: customers.fullName, email: customers.email, mobile: customers.mobile } })
    .from(loanApplications)
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .where(eq(loanApplications.id, applicationId))
    .limit(1);
  const [row] = opts.lock ? await base.for("update", { of: loanApplications }) : await base;
  if (!row) throw new NotFoundError();
  const [assignment] = await conn
    .select({ assigneeId: applicationAssignments.assigneeId })
    .from(applicationAssignments)
    .where(and(eq(applicationAssignments.applicationId, applicationId), eq(applicationAssignments.status, "ACTIVE")))
    .limit(1);
  return {
    app: row.app,
    customer: row.customer,
    facts: {
      customerUserId: row.customer.userId,
      referringAgentId: row.app.referringAgentId,
      createdById: row.app.createdById,
      activeAssigneeId: assignment?.assigneeId ?? null,
    },
  };
}

/** Loads and authorizes read access. Unauthorized access is reported as "not found" (no existence leak). */
export async function loadApplicationForView(conn: DbOrTx, actor: Actor, applicationId: string, opts: { lock?: boolean } = {}) {
  const loaded = await loadApplication(conn, applicationId, opts);
  const level = applicationViewLevel(actor, loaded.facts);
  if (!level) throw new NotFoundError();
  return { ...loaded, level: level as AppViewLevel };
}
