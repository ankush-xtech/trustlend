import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { hashPassword, randomCode } from "@/server/auth/crypto";
import { loadActor, type Actor } from "@/server/rbac/actor";
import { syncRbac } from "../../scripts/lib/rbac-sync";
import { ensureDemoCommissionRules, ensureDemoProducts, fillDemoApplication } from "../../scripts/lib/demo-catalog";
import { createDraftApplication, submitApplication } from "@/server/services/applications";
import { referCustomer } from "@/server/services/referrals";

export const PASSWORD = "Integration-Test-1";

/** Truncates all data (TRUNCATE does not fire the row-level append-only triggers) and re-seeds the catalog. */
export async function resetDatabase() {
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = tables.rows.map((t) => `"${t.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
  await syncRbac(db);
  const productIds = await ensureDemoProducts();
  await ensureDemoCommissionRules(productIds);
  return productIds as { HOME_LOAN: string; BUSINESS_LOAN: string };
}

let counter = 0;
export async function createUser(roleKey: string, opts: { verified?: boolean; email?: string; name?: string } = {}) {
  counter++;
  const email = opts.email ?? `${roleKey}-${counter}-${randomCode(4).toLowerCase()}@it.test`;
  const [u] = await db
    .insert(s.users)
    .values({
      email,
      name: opts.name ?? `Test ${roleKey.replace(/_/g, " ")} ${counter}`,
      phone: `98${String(10000000 + counter).slice(-8)}`,
      passwordHash: await hashPassword(PASSWORD),
      status: "ACTIVE",
      emailVerifiedAt: opts.verified === false ? null : new Date(),
    })
    .returning();
  if (roleKey) {
    const [role] = await db.select().from(s.roles).where(eq(s.roles.key, roleKey)).limit(1);
    await db.insert(s.userRoles).values({ userId: u.id, roleId: role.id });
  }
  return u;
}

export async function actorFor(userId: string): Promise<Actor> {
  const a = await loadActor(userId);
  if (!a) throw new Error("actor not loadable");
  return a;
}

export async function createAgentActor() {
  const u = await createUser("agent");
  await db.insert(s.agents).values({ userId: u.id, agentCode: `AG-${randomCode(6)}`, approvedAt: new Date() });
  return actorFor(u.id);
}

export async function createCustomerActor() {
  const u = await createUser("customer");
  return actorFor(u.id);
}

/** Customer self-service: draft → 5 steps → documents → submit. */
export async function submitDirectApplication(customer: Actor, productId: string, kind: "home_salaried" | "business" = "business", amount = "1500000") {
  const draft = await createDraftApplication(customer, { productId });
  const fresh = await actorFor(customer.userId); // customer profile now exists
  const version = await fillDemoApplication(
    fresh,
    draft.id,
    { fullName: "Asha Verma", dob: "1988-04-12", mobile: "9876500001", email: fresh.email },
    kind,
    amount,
  );
  const res = await submitApplication(fresh, draft.id, { declarationAccepted: true, expectedVersion: version });
  return { id: draft.id, reference: res.reference, customer: fresh };
}

/** Agent refers a brand-new customer and submits an application for them. */
export async function submitReferredApplication(agent: Actor, productId: string, kind: "home_salaried" | "business" = "home_salaried", amount = "4500000") {
  const n = ++counter;
  const ref = await referCustomer(agent, {
    fullName: "Ravi Kumar",
    email: `ravi-${n}-${randomCode(4).toLowerCase()}@it.test`,
    mobile: `97${String(10000000 + n).slice(-8)}`,
    consent: true,
  });
  if (ref.status !== "CREATED") throw new Error(`unexpected referral outcome ${ref.status}`);
  const draft = await createDraftApplication(agent, { productId, customerId: ref.customerId });
  const version = await fillDemoApplication(agent, draft.id, { fullName: "Ravi Kumar", dob: "1985-09-30", mobile: `97${String(10000000 + n).slice(-8)}`, email: "ravi@it.test" }, kind, amount);
  await submitApplication(agent, draft.id, { declarationAccepted: true, expectedVersion: version });
  return { id: draft.id, customerId: ref.customerId };
}

export async function appRow(id: string) {
  const [row] = await db.select().from(s.loanApplications).where(eq(s.loanApplications.id, id)).limit(1);
  return row;
}

export async function auditActions(entityId?: string) {
  const rows = entityId
    ? await db.select({ action: s.auditLogs.action }).from(s.auditLogs).where(eq(s.auditLogs.entityId, entityId))
    : await db.select({ action: s.auditLogs.action }).from(s.auditLogs);
  return rows.map((r) => r.action);
}
