import "server-only";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import { customers, loanApplications, referrals, roles, userRoles, users, agents } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requireAnyPermission, requirePermission } from "@/server/rbac/authorize";
import { SYSTEM_ROLE_KEYS } from "@/server/rbac/catalog";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { env } from "@/server/config/env";
import { emailSchema, isoDateSchema, mobileSchema, personNameSchema } from "@/lib/validation/common";
import { templates } from "@/server/email/templates";
import { recordAudit } from "./audit";
import { issueAuthToken } from "./auth";
import { appUrl, enqueueEmail, scheduleDispatch } from "./notifications";
import { likePattern, pageArgs, paged, type PageParams } from "./pagination";

/**
 * Returns the customer profile for a customer-portal user, creating or linking it on first use.
 * An unlinked customer record (e.g. created by an agent referral) is linked only when the user's email
 * is verified, so nobody can claim someone else's record by registering with their email.
 */
export async function ensureCustomerForActor(actor: Actor, conn: DbOrTx = db): Promise<string> {
  requirePermission(actor, "portal.customer");
  if (actor.customerId) return actor.customerId;
  const [user] = await conn.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user) throw new NotFoundError();
  if (env().REQUIRE_EMAIL_VERIFICATION && !user.emailVerifiedAt) {
    throw new BusinessRuleError("Please verify your email address before starting an application.");
  }
  const [existing] = await conn
    .select()
    .from(customers)
    .where(sql`lower(${customers.email}) = ${user.email.toLowerCase()}`)
    .limit(1);
  if (existing) {
    if (existing.userId && existing.userId !== user.id) throw new BusinessRuleError("This email is linked to another customer profile. Contact support.");
    if (!user.emailVerifiedAt) throw new BusinessRuleError("Please verify your email address to continue.");
    await conn.update(customers).set({ userId: user.id, updatedAt: new Date() }).where(and(eq(customers.id, existing.id), isNull(customers.userId)));
    await recordAudit(conn, { actor: auditActor(actor), action: "customer.account_linked", entityType: "customer", entityId: existing.id });
    return existing.id;
  }
  const [created] = await conn
    .insert(customers)
    .values({ userId: user.id, fullName: user.name, email: user.email, mobile: user.phone ?? "", createdById: user.id })
    .returning({ id: customers.id });
  await recordAudit(conn, { actor: auditActor(actor), action: "customer.created", entityType: "customer", entityId: created.id, after: { source: "self_registration" } });
  return created.id;
}

export async function getMyCustomerProfile(actor: Actor) {
  if (!actor.customerId) return null;
  const [c] = await db.select().from(customers).where(eq(customers.id, actor.customerId)).limit(1);
  return c ?? null;
}

// ------------------------------------------------------------------ admin

export async function listCustomers(actor: Actor, opts: PageParams & { q?: string }) {
  requirePermission(actor, "customers.read_all");
  const { page, pageSize, offset, limit } = pageArgs(opts);
  const where = opts.q
    ? or(ilike(customers.fullName, likePattern(opts.q)), ilike(customers.email, likePattern(opts.q)), ilike(customers.mobile, likePattern(opts.q)))
    : undefined;
  const rows = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      mobile: customers.mobile,
      hasAccount: sql<boolean>`${customers.userId} is not null`,
      createdAt: customers.createdAt,
      applicationCount: sql<number>`(select count(*)::int from loan_applications la where la.customer_id = ${qcol(customers.id)})`,
      referringAgent: sql<string | null>`(select u.name from referrals r join agents a on a.id = r.agent_id join users u on u.id = a.user_id where r.customer_id = ${qcol(customers.id)} and r.status = 'ACTIVE' limit 1)`,
    })
    .from(customers)
    .where(where)
    .orderBy(desc(customers.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where);
  return paged(rows, total, page, pageSize);
}

export async function getCustomerAdmin(actor: Actor, customerId: string) {
  requirePermission(actor, "customers.read_all");
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw new NotFoundError();
  const apps = await db
    .select({
      id: loanApplications.id,
      reference: loanApplications.reference,
      status: loanApplications.status,
      requestedAmount: loanApplications.requestedAmount,
      acquisitionSource: loanApplications.acquisitionSource,
      createdAt: loanApplications.createdAt,
    })
    .from(loanApplications)
    .where(eq(loanApplications.customerId, customerId))
    .orderBy(desc(loanApplications.createdAt));
  const refs = await db
    .select({
      id: referrals.id,
      status: referrals.status,
      createdAt: referrals.createdAt,
      agentName: users.name,
      agentCode: agents.agentCode,
    })
    .from(referrals)
    .innerJoin(agents, eq(agents.id, referrals.agentId))
    .innerJoin(users, eq(users.id, agents.userId))
    .where(eq(referrals.customerId, customerId))
    .orderBy(desc(referrals.createdAt));
  return { customer, applications: apps, referrals: refs };
}

export const customerUpdateSchema = z.object({
  fullName: personNameSchema,
  mobile: mobileSchema,
  dateOfBirth: z.union([isoDateSchema, z.literal("")]).optional().transform((v) => (v ? v : null)),
});

export async function updateCustomer(actor: Actor, customerId: string, input: unknown) {
  requirePermission(actor, "customers.manage");
  const parsed = customerUpdateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!before) throw new NotFoundError();
    await tx.update(customers).set({ ...parsed.data, updatedAt: new Date() }).where(eq(customers.id, customerId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "customer.updated",
      entityType: "customer",
      entityId: customerId,
      before: { fullName: before.fullName, mobile: before.mobile, dateOfBirth: before.dateOfBirth },
      after: parsed.data,
    });
  });
}

// ------------------------------------------------------------------ agent-facing

async function assertAgentHasActiveReferral(conn: DbOrTx, actor: Actor, customerId: string) {
  if (!actor.agentId) throw new AuthorizationError();
  const [ref] = await conn
    .select({ id: referrals.id })
    .from(referrals)
    .where(and(eq(referrals.customerId, customerId), eq(referrals.agentId, actor.agentId), eq(referrals.status, "ACTIVE")))
    .limit(1);
  if (!ref) throw new NotFoundError();
  return ref.id;
}

export async function listAgentCustomers(actor: Actor, opts: PageParams & { q?: string }) {
  requirePermission(actor, "portal.agent");
  if (!actor.agentId) return paged([], 0, 1, 20);
  const { page, pageSize, offset, limit } = pageArgs(opts);
  const conds = [eq(referrals.agentId, actor.agentId), inArray(referrals.status, ["ACTIVE", "PENDING_REVIEW"])];
  if (opts.q) conds.push(or(ilike(customers.fullName, likePattern(opts.q)), ilike(customers.mobile, likePattern(opts.q)))!);
  const where = and(...conds);
  const rows = await db
    .select({
      customerId: customers.id,
      referralId: referrals.id,
      referralStatus: referrals.status,
      // Pending-review referrals reveal no customer details beyond what the agent submitted themselves.
      fullName: sql<string>`case when ${referrals.status} = 'ACTIVE' then ${customers.fullName} else 'Referral under review' end`,
      mobile: sql<string>`case when ${referrals.status} = 'ACTIVE' then ${customers.mobile} else '' end`,
      email: sql<string>`case when ${referrals.status} = 'ACTIVE' then ${customers.email} else '' end`,
      hasAccount: sql<boolean>`${customers.userId} is not null`,
      referredAt: referrals.createdAt,
      applicationCount: sql<number>`(select count(*)::int from loan_applications la where la.customer_id = ${qcol(customers.id)} and la.referring_agent_id = ${actor.agentId})`,
    })
    .from(referrals)
    .innerJoin(customers, eq(customers.id, referrals.customerId))
    .where(where)
    .orderBy(desc(referrals.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(referrals)
    .innerJoin(customers, eq(customers.id, referrals.customerId))
    .where(where);
  return paged(rows, total, page, pageSize);
}

export async function getAgentCustomer(actor: Actor, customerId: string) {
  requirePermission(actor, "portal.agent");
  await assertAgentHasActiveReferral(db, actor, customerId);
  const [customer] = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      mobile: customers.mobile,
      hasAccount: sql<boolean>`${customers.userId} is not null`,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const apps = await db
    .select({
      id: loanApplications.id,
      reference: loanApplications.reference,
      status: loanApplications.status,
      requestedAmount: loanApplications.requestedAmount,
      createdAt: loanApplications.createdAt,
    })
    .from(loanApplications)
    .where(and(eq(loanApplications.customerId, customerId), eq(loanApplications.referringAgentId, actor.agentId!)))
    .orderBy(desc(loanApplications.createdAt));
  return { customer, applications: apps };
}

/** Invite a customer (without an account) to the customer portal. Agents need an active referral. */
export async function inviteCustomerToPortal(actor: Actor, customerId: string) {
  requireAnyPermission(actor, "customers.manage", "referrals.create");
  await db.transaction(async (tx) => {
    if (!actor.permissions.has("customers.manage")) await assertAgentHasActiveReferral(tx, actor, customerId);
    const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).for("update").limit(1);
    if (!customer) throw new NotFoundError();
    if (customer.userId) throw new BusinessRuleError("This customer already has a portal account.");
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, SYSTEM_ROLE_KEYS.CUSTOMER)).limit(1);
    let userId: string;
    try {
      const [u] = await tx
        .insert(users)
        .values({ name: customer.fullName, email: customer.email, phone: customer.mobile, status: "INVITED", createdById: actor.userId })
        .returning({ id: users.id });
      userId = u.id;
    } catch (e) {
      if (isUniqueViolation(e)) throw new BusinessRuleError("An account with this email already exists. The customer can sign in or reset their password.");
      throw e;
    }
    await tx.insert(userRoles).values({ userId, roleId: role.id, assignedById: actor.userId });
    await tx.update(customers).set({ userId, updatedAt: new Date() }).where(eq(customers.id, customerId));
    const token = await issueAuthToken(tx, userId, "INVITATION");
    await enqueueEmail(tx, {
      to: customer.email,
      userId,
      template: "invitation",
      email: templates.invitation({ name: customer.fullName, url: appUrl(`/accept-invitation?token=${token}`), roleName: "a customer", invitedBy: actor.name }),
      containsSecret: true,
    });
    await recordAudit(tx, { actor: auditActor(actor), action: "customer.invited", entityType: "customer", entityId: customerId });
  });
  scheduleDispatch();
}

export const referCustomerSchema = z.object({
  fullName: personNameSchema,
  email: emailSchema,
  mobile: mobileSchema,
  notes: z.string().trim().max(500).optional(),
  consent: z.literal(true, { error: "Confirm the customer agreed to be referred and contacted" }),
});
