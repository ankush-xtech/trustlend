import "server-only";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import { agents, commissionRecords, customers, loanApplications, referrals, users } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { reasonSchema } from "@/lib/validation/common";
import { recordAudit } from "./audit";
import { referCustomerSchema } from "./customers";
import { getSetting } from "./settings";

export type ReferralOutcome =
  | { status: "CREATED"; customerId: string; referralId: string }
  | { status: "ALREADY_REFERRED_BY_YOU"; customerId: string; referralId: string }
  | { status: "SUBMITTED_FOR_REVIEW"; referralId: string };

/**
 * Agent refers a customer.
 *  - New person (no email/mobile match): customer + ACTIVE referral are created.
 *  - Existing customer: never silently re-attributed. A PENDING_REVIEW referral is created for an admin
 *    to review; the response does not reveal whether or to whom the customer is attributed.
 */
export async function referCustomer(actor: Actor, input: unknown): Promise<ReferralOutcome> {
  requirePermission(actor, "referrals.create");
  if (!actor.agentId || !actor.agentActive) throw new AuthorizationError("Your agent profile is not active.");
  const parsed = referCustomerSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  const agentId = actor.agentId;

  return db.transaction(async (tx) => {
    // Serialize referrals for the same identity to avoid racing duplicates.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"referral:" + data.email}))`);
    const matches = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(or(sql`lower(${customers.email}) = ${data.email}`, eq(customers.mobile, data.mobile)))
      .limit(2);

    if (matches.length === 0) {
      const [customer] = await tx
        .insert(customers)
        .values({ fullName: data.fullName, email: data.email, mobile: data.mobile, createdById: actor.userId })
        .returning({ id: customers.id });
      const [ref] = await tx
        .insert(referrals)
        .values({ agentId, customerId: customer.id, status: "ACTIVE", agentNotes: data.notes, createdById: actor.userId })
        .returning({ id: referrals.id });
      await recordAudit(tx, {
        actor: auditActor(actor),
        action: "referral.created",
        entityType: "referral",
        entityId: ref.id,
        after: { agentId, customerId: customer.id, status: "ACTIVE" },
      });
      return { status: "CREATED", customerId: customer.id, referralId: ref.id };
    }

    const customerId = matches[0].id;
    const [mine] = await tx
      .select({ id: referrals.id, status: referrals.status })
      .from(referrals)
      .where(and(eq(referrals.customerId, customerId), eq(referrals.agentId, agentId), inArray(referrals.status, ["ACTIVE", "PENDING_REVIEW"])))
      .limit(1);
    if (mine?.status === "ACTIVE") return { status: "ALREADY_REFERRED_BY_YOU", customerId, referralId: mine.id };
    if (mine) return { status: "SUBMITTED_FOR_REVIEW", referralId: mine.id };

    try {
      const [ref] = await tx
        .insert(referrals)
        .values({
          agentId,
          customerId,
          status: "PENDING_REVIEW",
          agentNotes: [data.notes, matches.length > 1 ? "System: details matched more than one customer record." : null].filter(Boolean).join("\n") || null,
          createdById: actor.userId,
        })
        .returning({ id: referrals.id });
      await recordAudit(tx, {
        actor: auditActor(actor),
        action: "referral.submitted_for_review",
        entityType: "referral",
        entityId: ref.id,
        after: { agentId, customerId, status: "PENDING_REVIEW" },
      });
      return { status: "SUBMITTED_FOR_REVIEW", referralId: ref.id };
    } catch (e) {
      if (isUniqueViolation(e)) throw new BusinessRuleError("This referral has already been submitted.");
      throw e;
    }
  });
}

export async function listReferralsForReview(actor: Actor) {
  requirePermission(actor, "referrals.review");
  const rows = await db
    .select({
      id: referrals.id,
      createdAt: referrals.createdAt,
      agentNotes: referrals.agentNotes,
      customerId: customers.id,
      customerName: customers.fullName,
      customerEmail: customers.email,
      agentId: agents.id,
      agentCode: agents.agentCode,
      agentName: users.name,
      currentAgent: sql<string | null>`(select u2.name || ' (' || a2.agent_code || ')' from referrals r2 join agents a2 on a2.id = r2.agent_id join users u2 on u2.id = a2.user_id where r2.customer_id = ${qcol(customers.id)} and r2.status = 'ACTIVE' limit 1)`,
      applicationCount: sql<number>`(select count(*)::int from loan_applications la where la.customer_id = ${qcol(customers.id)})`,
    })
    .from(referrals)
    .innerJoin(customers, eq(customers.id, referrals.customerId))
    .innerJoin(agents, eq(agents.id, referrals.agentId))
    .innerJoin(users, eq(users.id, agents.userId))
    .where(eq(referrals.status, "PENDING_REVIEW"))
    .orderBy(desc(referrals.createdAt));
  return rows;
}

/**
 * Admin decision on a pending referral. Approval makes it the customer's ACTIVE referral (superseding
 * any previous one) for FUTURE applications. Existing applications keep their attribution unless it is
 * explicitly changed via `changeApplicationAttribution`.
 */
export async function reviewReferral(actor: Actor, referralId: string, decision: "APPROVE" | "REJECT", notesInput: unknown) {
  requirePermission(actor, "referrals.review");
  const notes = reasonSchema.safeParse(notesInput);
  if (!notes.success) throw new ValidationError(undefined, { notes: [notes.error.issues[0].message] });
  await db.transaction(async (tx) => {
    const [ref] = await tx.select().from(referrals).where(eq(referrals.id, referralId)).for("update").limit(1);
    if (!ref) throw new NotFoundError();
    if (ref.status !== "PENDING_REVIEW") throw new BusinessRuleError("This referral has already been reviewed.");
    let superseded: string[] = [];
    if (decision === "APPROVE") {
      const prev = await tx
        .update(referrals)
        .set({ status: "SUPERSEDED", reviewedById: actor.userId, reviewedAt: new Date(), reviewNotes: `Superseded by referral ${ref.id}`, updatedAt: new Date() })
        .where(and(eq(referrals.customerId, ref.customerId), eq(referrals.status, "ACTIVE")))
        .returning({ id: referrals.id });
      superseded = prev.map((p) => p.id);
    }
    await tx
      .update(referrals)
      .set({
        status: decision === "APPROVE" ? "ACTIVE" : "REJECTED",
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        reviewNotes: notes.data,
        updatedAt: new Date(),
      })
      .where(eq(referrals.id, referralId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: decision === "APPROVE" ? "referral.approved" : "referral.rejected",
      entityType: "referral",
      entityId: referralId,
      before: { status: "PENDING_REVIEW" },
      after: { status: decision === "APPROVE" ? "ACTIVE" : "REJECTED", superseded },
      reason: notes.data,
    });
  });
}

export async function revokeReferral(actor: Actor, referralId: string, reasonInput: unknown) {
  requirePermission(actor, "referrals.review");
  const reason = reasonSchema.safeParse(reasonInput);
  if (!reason.success) throw new ValidationError(undefined, { reason: [reason.error.issues[0].message] });
  await db.transaction(async (tx) => {
    const [ref] = await tx.select().from(referrals).where(eq(referrals.id, referralId)).for("update").limit(1);
    if (!ref) throw new NotFoundError();
    if (ref.status !== "ACTIVE") throw new BusinessRuleError("Only active referrals can be revoked.");
    await tx
      .update(referrals)
      .set({ status: "REVOKED", reviewedById: actor.userId, reviewedAt: new Date(), reviewNotes: reason.data, updatedAt: new Date() })
      .where(eq(referrals.id, referralId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "referral.revoked",
      entityType: "referral",
      entityId: referralId,
      before: { status: "ACTIVE" },
      after: { status: "REVOKED" },
      reason: reason.data,
    });
  });
}

export interface Attribution {
  acquisitionSource: "DIRECT" | "AGENT_REFERRAL";
  referringAgentId: string | null;
  referralId: string | null;
}

/**
 * Determines attribution for a NEW application, server-side only:
 *  - Agent creating for a customer: requires the agent's ACTIVE referral of that customer.
 *  - Customer self-starting: attributed to the agent holding the customer's ACTIVE referral if the agent is
 *    active and the referral is within the configured attribution window; otherwise DIRECT.
 */
export async function resolveAttributionForNewApplication(tx: DbOrTx, actor: Actor, customerId: string): Promise<Attribution> {
  if (actor.agentId && actor.permissions.has("referrals.create")) {
    const [ref] = await tx
      .select({ id: referrals.id })
      .from(referrals)
      .where(and(eq(referrals.customerId, customerId), eq(referrals.agentId, actor.agentId), eq(referrals.status, "ACTIVE")))
      .limit(1);
    if (!ref) throw new AuthorizationError("You can only start applications for customers you have an active referral for.");
    return { acquisitionSource: "AGENT_REFERRAL", referringAgentId: actor.agentId, referralId: ref.id };
  }
  const windowDays = await getSetting("referral.attributionWindowDays");
  const [ref] = await tx
    .select({ id: referrals.id, agentId: referrals.agentId, agentStatus: agents.status, startedAt: sql<Date>`coalesce(${referrals.reviewedAt}, ${referrals.createdAt})` })
    .from(referrals)
    .innerJoin(agents, eq(agents.id, referrals.agentId))
    .where(and(eq(referrals.customerId, customerId), eq(referrals.status, "ACTIVE")))
    .limit(1);
  if (ref && ref.agentStatus === "ACTIVE") {
    const ageDays = (Date.now() - new Date(ref.startedAt).getTime()) / 86_400_000;
    if (ageDays <= windowDays) return { acquisitionSource: "AGENT_REFERRAL", referringAgentId: ref.agentId, referralId: ref.id };
  }
  return { acquisitionSource: "DIRECT", referringAgentId: null, referralId: null };
}

export const changeAttributionSchema = z.object({
  agentId: z.union([z.uuid(), z.literal("")]).transform((v) => (v ? v : null)),
  reason: reasonSchema,
});

/**
 * Explicit, audited attribution change (e.g. after a dispute review). Blocked once a commission has
 * been approved or paid; a pending commission is cancelled so it can be recalculated for the new agent.
 */
export async function changeApplicationAttribution(actor: Actor, applicationId: string, input: unknown) {
  requirePermission(actor, "applications.change_attribution");
  const parsed = changeAttributionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const { agentId, reason } = parsed.data;
  await db.transaction(async (tx) => {
    const [app] = await tx.select().from(loanApplications).where(eq(loanApplications.id, applicationId)).for("update").limit(1);
    if (!app) throw new NotFoundError();
    if (app.referringAgentId === agentId) return;
    const [commission] = await tx
      .select()
      .from(commissionRecords)
      .where(and(eq(commissionRecords.applicationId, applicationId), ne(commissionRecords.status, "CANCELLED")))
      .limit(1);
    if (commission && ["APPROVED", "PAID"].includes(commission.status)) {
      throw new BusinessRuleError("Attribution cannot change after a commission has been approved or paid. Record an adjustment instead.");
    }
    let referralId: string | null = null;
    if (agentId) {
      const [agent] = await tx.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).limit(1);
      if (!agent) throw new ValidationError(undefined, { agentId: ["Unknown agent"] });
      const [ref] = await tx
        .select({ id: referrals.id })
        .from(referrals)
        .where(and(eq(referrals.customerId, app.customerId), eq(referrals.agentId, agentId), eq(referrals.status, "ACTIVE")))
        .limit(1);
      referralId = ref?.id ?? null;
    }
    if (commission) {
      // The commission row is retained (never deleted); it is cancelled so a new calculation can be made.
      throw new BusinessRuleError(
        "A pending commission exists for this application. Cancel it from Commission management before changing attribution.",
      );
    }
    await tx
      .update(loanApplications)
      .set({
        acquisitionSource: agentId ? "AGENT_REFERRAL" : "DIRECT",
        referringAgentId: agentId,
        referralId,
        version: sql`${loanApplications.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(loanApplications.id, applicationId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "application.attribution_changed",
      entityType: "loan_application",
      entityId: applicationId,
      before: { acquisitionSource: app.acquisitionSource, referringAgentId: app.referringAgentId },
      after: { acquisitionSource: agentId ? "AGENT_REFERRAL" : "DIRECT", referringAgentId: agentId },
      reason,
    });
  });
}
