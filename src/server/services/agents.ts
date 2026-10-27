import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import { agents, roles, users } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";
import { SYSTEM_ROLE_KEYS } from "@/server/rbac/catalog";
import { NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { emailSchema, mobileSchema, personNameSchema, reasonSchema } from "@/lib/validation/common";
import { randomCode } from "@/server/auth/crypto";
import { recordAudit } from "./audit";
import { createUserWithInvitation } from "./users";
import { likePattern, pageArgs, paged, type PageParams } from "./pagination";

export const onboardAgentSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  phone: mobileSchema,
  companyName: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  payoutReferenceMasked: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9 •xX*-]*$/, "Enter a masked reference only (e.g. XXXX1234)")
    .optional(),
});

/**
 * Administrator-controlled agent onboarding: creates an invited user with the Agent role and an agent
 * profile in one transaction. The agent sets their own password from the invitation email.
 */
export async function onboardAgent(actor: Actor, input: unknown) {
  requirePermission(actor, "agents.manage");
  const parsed = onboardAgentSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  return db.transaction(async (tx) => {
    const [agentRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, SYSTEM_ROLE_KEYS.AGENT)).limit(1);
    if (!agentRole) throw new Error("Agent role is not provisioned");
    const userId = await createUserWithInvitation(actor, { name: data.name, email: data.email, phone: data.phone, roleIds: [agentRole.id] }, tx);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [agent] = await tx
          .insert(agents)
          .values({
            userId,
            agentCode: `AG-${randomCode(6)}`,
            status: "ACTIVE",
            companyName: data.companyName || null,
            city: data.city || null,
            payoutReferenceMasked: data.payoutReferenceMasked || null,
            approvedById: actor.userId,
            approvedAt: new Date(),
          })
          .returning({ id: agents.id, agentCode: agents.agentCode });
        await recordAudit(tx, {
          actor: auditActor(actor),
          action: "agent.onboarded",
          entityType: "agent",
          entityId: agent.id,
          after: { userId, agentCode: agent.agentCode },
        });
        return agent.id;
      } catch (e) {
        if (!isUniqueViolation(e, "agents_code_unique")) throw e;
      }
    }
    throw new Error("Could not allocate a unique agent code");
  });
}

export async function listAgents(actor: Actor, opts: PageParams & { q?: string; status?: string }) {
  requirePermission(actor, "agents.read_all");
  const { page, pageSize, offset, limit } = pageArgs(opts);
  const conds = [];
  if (opts.q) conds.push(or(ilike(users.name, likePattern(opts.q)), ilike(users.email, likePattern(opts.q)), ilike(agents.agentCode, likePattern(opts.q))));
  if (opts.status === "ACTIVE" || opts.status === "SUSPENDED") conds.push(eq(agents.status, opts.status));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: agents.id,
      agentCode: agents.agentCode,
      status: agents.status,
      name: users.name,
      email: users.email,
      userStatus: users.status,
      companyName: agents.companyName,
      city: agents.city,
      createdAt: agents.createdAt,
      referralCount: sql<number>`(select count(*)::int from referrals r where r.agent_id = ${qcol(agents.id)} and r.status = 'ACTIVE')`,
      applicationCount: sql<number>`(select count(*)::int from loan_applications la where la.referring_agent_id = ${qcol(agents.id)} and la.status <> 'DRAFT')`,
      disbursedCount: sql<number>`(select count(*)::int from loan_applications la where la.referring_agent_id = ${qcol(agents.id)} and la.status in ('DISBURSED','CLOSED') and exists (select 1 from disbursements d where d.application_id = la.id))`,
      commissionPaid: sql<string>`(select coalesce(sum(cp.amount),0)::text from commission_payments cp join commission_records cr on cr.id = cp.commission_id where cr.agent_id = ${qcol(agents.id)})`,
    })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.userId))
    .where(where)
    .orderBy(desc(agents.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(agents).innerJoin(users, eq(users.id, agents.userId)).where(where);
  return paged(rows, total, page, pageSize);
}

export async function getAgentAdmin(actor: Actor, agentId: string) {
  requirePermission(actor, "agents.read_all");
  const [agent] = await db
    .select({
      id: agents.id,
      userId: agents.userId,
      agentCode: agents.agentCode,
      status: agents.status,
      companyName: agents.companyName,
      city: agents.city,
      payoutReferenceMasked: agents.payoutReferenceMasked,
      notes: agents.notes,
      createdAt: agents.createdAt,
      approvedAt: agents.approvedAt,
      name: users.name,
      email: users.email,
      phone: users.phone,
      userStatus: users.status,
    })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.userId))
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!agent) throw new NotFoundError();
  return agent;
}

export async function listAgentOptions(actor: Actor) {
  requirePermission(actor, "agents.read_all");
  return db
    .select({ id: agents.id, label: sql<string>`${users.name} || ' (' || ${agents.agentCode} || ')'` })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.userId))
    .orderBy(users.name);
}

export const updateAgentSchema = z.object({
  companyName: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  payoutReferenceMasked: onboardAgentSchema.shape.payoutReferenceMasked,
  notes: z.string().trim().max(1000).optional(),
});

export async function updateAgent(actor: Actor, agentId: string, input: unknown) {
  requirePermission(actor, "agents.manage");
  const parsed = updateAgentSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!before) throw new NotFoundError();
    const values = {
      companyName: parsed.data.companyName || null,
      city: parsed.data.city || null,
      payoutReferenceMasked: parsed.data.payoutReferenceMasked || null,
      notes: parsed.data.notes || null,
    };
    await tx.update(agents).set({ ...values, updatedAt: new Date() }).where(eq(agents.id, agentId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "agent.updated",
      entityType: "agent",
      entityId: agentId,
      before: { companyName: before.companyName, city: before.city, payoutReferenceMasked: before.payoutReferenceMasked },
      after: values,
    });
  });
}

export async function setAgentStatus(actor: Actor, agentId: string, status: "ACTIVE" | "SUSPENDED", reasonInput: unknown) {
  requirePermission(actor, "agents.manage");
  const reason = reasonSchema.safeParse(reasonInput);
  if (!reason.success) throw new ValidationError(undefined, { reason: [reason.error.issues[0].message] });
  await db.transaction(async (tx) => {
    const [agent] = await tx.select().from(agents).where(eq(agents.id, agentId)).for("update").limit(1);
    if (!agent) throw new NotFoundError();
    if (agent.status === status) return;
    await tx.update(agents).set({ status, updatedAt: new Date() }).where(eq(agents.id, agentId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: status === "SUSPENDED" ? "agent.suspended" : "agent.reactivated",
      entityType: "agent",
      entityId: agentId,
      before: { status: agent.status },
      after: { status },
      reason: reason.data,
    });
  });
}

export async function getMyAgentProfile(actor: Actor) {
  requirePermission(actor, "portal.agent");
  if (!actor.agentId) return null;
  const [agent] = await db.select().from(agents).where(eq(agents.id, actor.agentId)).limit(1);
  return agent ?? null;
}

/** Applications attributed to an agent (admin view). */
export async function listAgentApplicationsAdmin(actor: Actor, agentId: string, limit = 50) {
  requirePermission(actor, "agents.read_all");
  requirePermission(actor, "applications.read_all");
  return db.execute<{ id: string; reference: string; status: string; requested_amount: string | null; customer_name: string; product_name: string; created_at: Date }>(sql`
    select a.id, a.reference, a.status, a.requested_amount::text, c.full_name as customer_name, p.name as product_name, a.created_at
    from loan_applications a join customers c on c.id = a.customer_id join loan_products p on p.id = a.product_id
    where a.referring_agent_id = ${agentId}
    order by a.created_at desc limit ${Math.min(Math.max(limit, 1), 200)}`);
}
