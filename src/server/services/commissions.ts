import "server-only";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import Decimal from "decimal.js";
import { db, type DbOrTx } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import {
  agents,
  commissionAdjustments,
  commissionPayments,
  commissionRecords,
  commissionRules,
  customers,
  loanApplications,
  loanProducts,
  users,
  type CommissionStatus,
} from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requireAnyPermission, requirePermission } from "@/server/rbac/authorize";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { calculateCommission, selectRule, validateSlabs, type RuleInput } from "@/lib/domain/commission-calc";
import { isoDateSchema, moneySchema, reasonSchema } from "@/lib/validation/common";
import { formatMoney } from "@/lib/format";
import { templates } from "@/server/email/templates";
import { recordAudit } from "./audit";
import { appUrl, notifyUser, scheduleDispatch } from "./notifications";
import { pageArgs, paged, type PageParams } from "./pagination";

type CommissionRow = typeof commissionRecords.$inferSelect;

function toRuleInput(r: typeof commissionRules.$inferSelect): RuleInput {
  return {
    id: r.id,
    name: r.name,
    productId: r.productId,
    agentId: r.agentId,
    calcType: r.calcType,
    ratePercent: r.ratePercent,
    fixedAmount: r.fixedAmount,
    slabs: r.slabs,
    minBaseAmount: r.minBaseAmount,
    maxBaseAmount: r.maxBaseAmount,
    capAmount: r.capAmount,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    priority: r.priority,
    isActive: r.isActive,
  };
}

// ======================================================================= creation (system)

/**
 * Creates the commission record for a confirmed disbursement. Called inside the disbursement transaction.
 * Idempotent: the unique index on application_id means a retry, duplicate webhook or repeated status update
 * returns the existing record and never creates a second commission.
 * Direct-customer applications never produce a commission (also enforced by a database trigger).
 */
export async function createCommissionForDisbursement(
  tx: DbOrTx,
  p: { applicationId: string; disbursedAmount: string; disbursedOn: string; actor: Actor | null },
): Promise<CommissionRow | null> {
  const [app] = await tx
    .select({ id: loanApplications.id, acquisitionSource: loanApplications.acquisitionSource, referringAgentId: loanApplications.referringAgentId, productId: loanApplications.productId })
    .from(loanApplications)
    .where(eq(loanApplications.id, p.applicationId))
    .limit(1);
  if (!app || app.acquisitionSource !== "AGENT_REFERRAL" || !app.referringAgentId) return null;

  const [existing] = await tx.select().from(commissionRecords).where(eq(commissionRecords.applicationId, app.id)).limit(1);
  if (existing) return existing;

  const rules = (await tx.select().from(commissionRules).where(eq(commissionRules.isActive, true))).map(toRuleInput);
  const ctx = { productId: app.productId, agentId: app.referringAgentId, baseAmount: p.disbursedAmount, onDate: p.disbursedOn };
  const rule = selectRule(rules, ctx);
  const base = new Decimal(p.disbursedAmount).toFixed(2);

  let values: typeof commissionRecords.$inferInsert;
  if (!rule) {
    values = {
      applicationId: app.id,
      agentId: app.referringAgentId,
      ruleId: null,
      ruleSnapshot: null,
      baseAmount: base,
      calculatedAmount: "0.00",
      payableAmount: "0.00",
      status: "NOT_ELIGIBLE",
      calculationDetails: { reason: "No active commission rule matched this disbursement", context: ctx },
    };
  } else {
    const result = calculateCommission(rule, base);
    values = {
      applicationId: app.id,
      agentId: app.referringAgentId,
      ruleId: rule.id,
      ruleSnapshot: { ...rule },
      baseAmount: base,
      calculatedAmount: result.amount,
      payableAmount: result.amount,
      status: "PENDING_VERIFICATION",
      calculationDetails: { ...result.details, baseDefinition: "Confirmed disbursed principal", ruleName: rule.name },
    };
  }
  const inserted = await tx.insert(commissionRecords).values(values).onConflictDoNothing({ target: commissionRecords.applicationId }).returning();
  if (!inserted.length) {
    const [row] = await tx.select().from(commissionRecords).where(eq(commissionRecords.applicationId, app.id)).limit(1);
    return row ?? null;
  }
  await recordAudit(tx, {
    actor: p.actor ? auditActor(p.actor) : null,
    action: "commission.calculated",
    entityType: "commission",
    entityId: inserted[0].id,
    after: { applicationId: app.id, agentId: app.referringAgentId, ruleId: values.ruleId, base, amount: values.calculatedAmount, status: values.status },
  });
  return inserted[0];
}

// ======================================================================= lifecycle

async function lockCommission(tx: DbOrTx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError();
  const [row] = await tx.select().from(commissionRecords).where(eq(commissionRecords.id, id)).for("update").limit(1);
  if (!row) throw new NotFoundError();
  return row;
}

function assertNotOwnCommission(actor: Actor, c: CommissionRow) {
  if (actor.agentId && actor.agentId === c.agentId) throw new AuthorizationError("You cannot act on your own commission.");
}

function checkVersion(c: CommissionRow, expected: number | undefined) {
  if (expected !== undefined && c.version !== expected) throw new ConflictError();
}

async function notifyAgent(tx: DbOrTx, c: CommissionRow, kind: "approved" | "paid", paymentReference?: string) {
  const [row] = await tx
    .select({ userId: agents.userId, name: users.name, reference: loanApplications.reference })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.userId))
    .innerJoin(loanApplications, eq(loanApplications.id, c.applicationId))
    .where(eq(agents.id, c.agentId))
    .limit(1);
  if (!row) return;
  const url = appUrl("/agent/commissions");
  const amount = formatMoney(c.payableAmount);
  await notifyUser(tx, row.userId, {
    template: kind === "approved" ? "commission_approved" : "commission_paid",
    email:
      kind === "approved"
        ? templates.commissionApproved({ name: row.name, reference: row.reference, amount, url })
        : templates.commissionPaid({ name: row.name, reference: row.reference, amount, paymentReference: paymentReference ?? "", url }),
    linkPath: "/agent/commissions",
    entityType: "commission",
    entityId: c.id,
    dedupeKey: `commission-${kind}:${c.id}:${c.version}`,
  });
}

export async function approveCommission(actor: Actor, id: string, opts: { expectedVersion?: number; notes?: string } = {}) {
  requirePermission(actor, "commissions.approve");
  await db.transaction(async (tx) => {
    const c = await lockCommission(tx, id);
    assertNotOwnCommission(actor, c);
    checkVersion(c, opts.expectedVersion);
    if (!["PENDING_VERIFICATION", "ADJUSTMENT_REQUIRED"].includes(c.status)) throw new BusinessRuleError("Only commissions pending verification can be approved.");
    if (new Decimal(c.payableAmount).lte(0)) throw new BusinessRuleError("A zero commission cannot be approved; cancel it or record an adjustment.");
    const [updated] = await tx
      .update(commissionRecords)
      .set({ status: "APPROVED", approvedById: actor.userId, approvedAt: new Date(), version: c.version + 1, updatedAt: new Date() })
      .where(and(eq(commissionRecords.id, id), eq(commissionRecords.version, c.version)))
      .returning();
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "commission.approved",
      entityType: "commission",
      entityId: id,
      before: { status: c.status },
      after: { status: "APPROVED", payableAmount: c.payableAmount },
      reason: opts.notes ?? null,
    });
    await notifyAgent(tx, updated, "approved");
  });
  scheduleDispatch();
}

export async function flagCommissionForAdjustment(actor: Actor, id: string, reasonInput: unknown) {
  requirePermission(actor, "commissions.approve");
  const reason = reasonSchema.parse(reasonInput);
  await db.transaction(async (tx) => {
    const c = await lockCommission(tx, id);
    assertNotOwnCommission(actor, c);
    if (!["PENDING_VERIFICATION", "APPROVED"].includes(c.status)) throw new BusinessRuleError("This commission cannot be flagged.");
    await tx.update(commissionRecords).set({ status: "ADJUSTMENT_REQUIRED", version: c.version + 1, updatedAt: new Date() }).where(eq(commissionRecords.id, id));
    await recordAudit(tx, { actor: auditActor(actor), action: "commission.flagged", entityType: "commission", entityId: id, before: { status: c.status }, after: { status: "ADJUSTMENT_REQUIRED" }, reason });
  });
}

export const adjustmentSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Enter an amount, negative for deductions")
    .refine((v) => !new Decimal(v).isZero(), "Amount cannot be zero"),
  reason: reasonSchema,
});

/** Adds a signed adjustment. The commission returns to PENDING_VERIFICATION and must be re-approved. */
export async function addCommissionAdjustment(actor: Actor, id: string, input: unknown) {
  requirePermission(actor, "commissions.adjust");
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  await db.transaction(async (tx) => {
    const c = await lockCommission(tx, id);
    assertNotOwnCommission(actor, c);
    if (["PAID", "CANCELLED"].includes(c.status)) throw new BusinessRuleError("Paid or cancelled commissions cannot be adjusted.");
    const newPayable = new Decimal(c.payableAmount).add(parsed.data.amount);
    if (newPayable.lt(0)) throw new ValidationError(undefined, { amount: ["The adjustment would make the payable amount negative"] });
    await tx.insert(commissionAdjustments).values({ commissionId: id, amount: new Decimal(parsed.data.amount).toFixed(2), reason: parsed.data.reason, createdById: actor.userId });
    await tx
      .update(commissionRecords)
      .set({
        payableAmount: newPayable.toFixed(2),
        status: "PENDING_VERIFICATION",
        approvedById: null,
        approvedAt: null,
        version: c.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(commissionRecords.id, id));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "commission.adjusted",
      entityType: "commission",
      entityId: id,
      before: { payableAmount: c.payableAmount, status: c.status },
      after: { payableAmount: newPayable.toFixed(2), adjustment: parsed.data.amount, status: "PENDING_VERIFICATION" },
      reason: parsed.data.reason,
    });
  });
}

export async function cancelCommission(actor: Actor, id: string, reasonInput: unknown) {
  requirePermission(actor, "commissions.approve");
  const reason = reasonSchema.safeParse(reasonInput);
  if (!reason.success) throw new ValidationError(undefined, { reason: [reason.error.issues[0].message] });
  await db.transaction(async (tx) => {
    const c = await lockCommission(tx, id);
    assertNotOwnCommission(actor, c);
    if (c.status === "PAID") throw new BusinessRuleError("Paid commissions cannot be cancelled. Record an adjustment instead.");
    if (c.status === "CANCELLED") return;
    await tx
      .update(commissionRecords)
      .set({ status: "CANCELLED", cancelledById: actor.userId, cancelledAt: new Date(), cancellationReason: reason.data, version: c.version + 1, updatedAt: new Date() })
      .where(eq(commissionRecords.id, id));
    await recordAudit(tx, { actor: auditActor(actor), action: "commission.cancelled", entityType: "commission", entityId: id, before: { status: c.status }, after: { status: "CANCELLED" }, reason: reason.data });
  });
}

export const paymentSchema = z.object({
  amount: moneySchema,
  paymentReference: z.string().trim().min(4, "Enter the bank / payout reference").max(80),
  paymentMethod: z.enum(["BANK_TRANSFER", "UPI", "CHEQUE", "OTHER"]),
  paidOn: isoDateSchema,
  notes: z.string().trim().max(500).optional(),
});

/**
 * Records a payment against an APPROVED commission. Requires an external payment reference; the amount
 * must equal the payable amount. Unique constraints prevent double payment and reference reuse.
 */
export async function recordCommissionPayment(actor: Actor, id: string, input: unknown) {
  requirePermission(actor, "commissions.mark_paid");
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  if (data.paidOn > new Date().toISOString().slice(0, 10)) throw new ValidationError(undefined, { paidOn: ["Payment date cannot be in the future"] });
  await db.transaction(async (tx) => {
    const c = await lockCommission(tx, id);
    assertNotOwnCommission(actor, c);
    if (c.status === "PAID") throw new BusinessRuleError("A payment has already been recorded for this commission.");
    if (c.status !== "APPROVED") throw new BusinessRuleError("Only approved commissions can be paid.");
    if (!new Decimal(data.amount).eq(c.payableAmount)) {
      throw new ValidationError(undefined, { amount: [`Amount must equal the approved payable amount (${formatMoney(c.payableAmount)})`] });
    }
    try {
      await tx.insert(commissionPayments).values({
        commissionId: id,
        amount: new Decimal(data.amount).toFixed(2),
        paymentReference: data.paymentReference,
        paymentMethod: data.paymentMethod,
        paidOn: data.paidOn,
        notes: data.notes ?? null,
        recordedById: actor.userId,
      });
    } catch (e) {
      if (isUniqueViolation(e, "commission_payments_reference_unique")) throw new ValidationError(undefined, { paymentReference: ["This payment reference is already recorded"] });
      if (isUniqueViolation(e)) throw new BusinessRuleError("A payment has already been recorded for this commission.");
      throw e;
    }
    const [updated] = await tx
      .update(commissionRecords)
      .set({ status: "PAID", version: c.version + 1, updatedAt: new Date() })
      .where(eq(commissionRecords.id, id))
      .returning();
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "commission.paid",
      entityType: "commission",
      entityId: id,
      before: { status: "APPROVED" },
      after: { status: "PAID", amount: data.amount, paymentReference: data.paymentReference, paidOn: data.paidOn },
    });
    await notifyAgent(tx, updated, "paid", data.paymentReference);
  });
  scheduleDispatch();
}

// ======================================================================= queries

export interface CommissionFilters extends PageParams {
  status?: string;
  agentId?: string;
}

export async function listCommissions(actor: Actor, scope: "own" | "all", f: CommissionFilters) {
  const conds: SQL[] = [];
  if (scope === "all") {
    requirePermission(actor, "commissions.read_all");
    if (f.agentId && z.uuid().safeParse(f.agentId).success) conds.push(eq(commissionRecords.agentId, f.agentId));
  } else {
    requirePermission(actor, "commissions.read_own");
    if (!actor.agentId) return paged([], 0, 1, 20);
    conds.push(eq(commissionRecords.agentId, actor.agentId));
  }
  const statuses = ["NOT_ELIGIBLE", "PENDING_VERIFICATION", "APPROVED", "ADJUSTMENT_REQUIRED", "PAID", "CANCELLED"];
  if (f.status && statuses.includes(f.status)) conds.push(eq(commissionRecords.status, f.status as CommissionStatus));
  const where = conds.length ? and(...conds) : undefined;
  const { page, pageSize, offset, limit } = pageArgs(f);
  const rows = await db
    .select({
      id: commissionRecords.id,
      applicationId: commissionRecords.applicationId,
      reference: loanApplications.reference,
      productName: loanProducts.name,
      customerName: customers.fullName,
      agentName: users.name,
      agentCode: agents.agentCode,
      baseAmount: commissionRecords.baseAmount,
      calculatedAmount: commissionRecords.calculatedAmount,
      payableAmount: commissionRecords.payableAmount,
      status: commissionRecords.status,
      createdAt: commissionRecords.createdAt,
      approvedAt: commissionRecords.approvedAt,
      version: commissionRecords.version,
      paidOn: sql<string | null>`(select paid_on::text from commission_payments p where p.commission_id = ${qcol(commissionRecords.id)})`,
      paymentReference: sql<string | null>`(select payment_reference from commission_payments p where p.commission_id = ${qcol(commissionRecords.id)})`,
    })
    .from(commissionRecords)
    .innerJoin(loanApplications, eq(loanApplications.id, commissionRecords.applicationId))
    .innerJoin(loanProducts, eq(loanProducts.id, loanApplications.productId))
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .innerJoin(agents, eq(agents.id, commissionRecords.agentId))
    .innerJoin(users, eq(users.id, agents.userId))
    .where(where)
    .orderBy(desc(commissionRecords.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(commissionRecords).where(where);
  return paged(rows, total, page, pageSize);
}

export async function getCommissionDetail(actor: Actor, id: string) {
  requireAnyPermission(actor, "commissions.read_all", "commissions.read_own");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError();
  const [c] = await db
    .select({
      commission: commissionRecords,
      reference: loanApplications.reference,
      productName: loanProducts.name,
      customerName: customers.fullName,
      agentName: users.name,
      agentCode: agents.agentCode,
    })
    .from(commissionRecords)
    .innerJoin(loanApplications, eq(loanApplications.id, commissionRecords.applicationId))
    .innerJoin(loanProducts, eq(loanProducts.id, loanApplications.productId))
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .innerJoin(agents, eq(agents.id, commissionRecords.agentId))
    .innerJoin(users, eq(users.id, agents.userId))
    .where(eq(commissionRecords.id, id))
    .limit(1);
  if (!c) throw new NotFoundError();
  const all = actor.permissions.has("commissions.read_all");
  if (!all && c.commission.agentId !== actor.agentId) throw new NotFoundError();
  const adjustments = await db
    .select({ id: commissionAdjustments.id, amount: commissionAdjustments.amount, reason: commissionAdjustments.reason, createdAt: commissionAdjustments.createdAt, byName: users.name })
    .from(commissionAdjustments)
    .innerJoin(users, eq(users.id, commissionAdjustments.createdById))
    .where(eq(commissionAdjustments.commissionId, id))
    .orderBy(asc(commissionAdjustments.createdAt));
  const [payment] = await db.select().from(commissionPayments).where(eq(commissionPayments.commissionId, id)).limit(1);
  return { ...c, adjustments, payment: payment ?? null, canSeeInternal: all };
}

export async function agentCommissionSummary(actor: Actor) {
  requirePermission(actor, "commissions.read_own");
  if (!actor.agentId) return { pending: "0.00", approved: "0.00", paid: "0.00", count: 0 };
  const [row] = await db
    .select({
      pending: sql<string>`coalesce(sum(case when status in ('PENDING_VERIFICATION','ADJUSTMENT_REQUIRED') then payable_amount end),0)::text`,
      approved: sql<string>`coalesce(sum(case when status = 'APPROVED' then payable_amount end),0)::text`,
      paid: sql<string>`coalesce(sum(case when status = 'PAID' then payable_amount end),0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissionRecords)
    .where(eq(commissionRecords.agentId, actor.agentId));
  return row;
}

// ======================================================================= rules

const optionalMoney = z
  .union([moneySchema, z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const ratePercentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, "Enter a percentage (up to 4 decimals)")
  .refine((v) => new Decimal(v).lte(100), "Rate cannot exceed 100%");

export const commissionRuleSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().max(500).default(""),
    productId: z.union([z.uuid(), z.literal("")]).transform((v) => (v ? v : null)),
    agentId: z.union([z.uuid(), z.literal("")]).transform((v) => (v ? v : null)),
    calcType: z.enum(["PERCENTAGE", "FIXED", "SLAB"]),
    ratePercent: z.union([ratePercentSchema, z.literal("")]).optional().nullable().transform((v) => (v ? v : null)),
    fixedAmount: optionalMoney,
    slabs: z
      .array(
        z.object({
          minAmount: moneySchema,
          maxAmount: z.union([moneySchema, z.literal("")]).nullable().transform((v) => (v ? v : null)),
          ratePercent: z.union([ratePercentSchema, z.literal("")]).optional().nullable().transform((v) => (v ? v : null)),
          fixedAmount: optionalMoney,
        }),
      )
      .max(20)
      .optional()
      .nullable(),
    minBaseAmount: optionalMoney,
    maxBaseAmount: optionalMoney,
    capAmount: optionalMoney,
    effectiveFrom: isoDateSchema,
    effectiveTo: z.union([isoDateSchema, z.literal("")]).optional().nullable().transform((v) => (v ? v : null)),
    priority: z.coerce.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    if (r.calcType === "PERCENTAGE" && !r.ratePercent) ctx.addIssue({ code: "custom", path: ["ratePercent"], message: "Enter the rate" });
    if (r.calcType === "FIXED" && !r.fixedAmount) ctx.addIssue({ code: "custom", path: ["fixedAmount"], message: "Enter the fixed amount" });
    if (r.calcType === "SLAB") {
      const err = validateSlabs(r.slabs ?? []);
      if (err) ctx.addIssue({ code: "custom", path: ["slabs"], message: err });
    }
    if (r.effectiveTo && r.effectiveTo < r.effectiveFrom) ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "End date must be after start date" });
    if (r.minBaseAmount && r.maxBaseAmount && new Decimal(r.maxBaseAmount).lte(r.minBaseAmount)) {
      ctx.addIssue({ code: "custom", path: ["maxBaseAmount"], message: "Maximum must exceed minimum" });
    }
  })
  .transform((r) => ({
    ...r,
    ratePercent: r.calcType === "PERCENTAGE" ? r.ratePercent : null,
    fixedAmount: r.calcType === "FIXED" ? r.fixedAmount : null,
    slabs: r.calcType === "SLAB" ? (r.slabs ?? null) : null,
  }));

/** Canonical form for comparing slab definitions (fixed decimals, explicit nulls). */
function normalizeSlabs(slabs: { minAmount: string; maxAmount: string | null; ratePercent?: string | null; fixedAmount?: string | null }[] | null | undefined) {
  if (!slabs) return null;
  const dec = (v: string | null | undefined, dp: number) => (v === null || v === undefined || v === "" ? null : new Decimal(v).toFixed(dp));
  return slabs.map((s) => ({
    minAmount: dec(s.minAmount, 2),
    maxAmount: dec(s.maxAmount, 2),
    ratePercent: dec(s.ratePercent, 4),
    fixedAmount: dec(s.fixedAmount, 2),
  }));
}

export async function listCommissionRules(actor: Actor) {
  requireAnyPermission(actor, "commission_rules.manage", "commissions.read_all");
  return db
    .select({
      rule: commissionRules,
      productName: loanProducts.name,
      agentLabel: sql<string | null>`(select u.name || ' (' || a.agent_code || ')' from agents a join users u on u.id = a.user_id where a.id = ${qcol(commissionRules.agentId)})`,
      usageCount: sql<number>`(select count(*)::int from commission_records cr where cr.rule_id = ${qcol(commissionRules.id)})`,
    })
    .from(commissionRules)
    .leftJoin(loanProducts, eq(loanProducts.id, commissionRules.productId))
    .orderBy(desc(commissionRules.isActive), asc(commissionRules.name));
}

export async function getCommissionRule(actor: Actor, id: string) {
  requireAnyPermission(actor, "commission_rules.manage", "commissions.read_all");
  const [rule] = await db.select().from(commissionRules).where(eq(commissionRules.id, id)).limit(1);
  if (!rule) throw new NotFoundError();
  const [{ usage }] = await db.select({ usage: sql<number>`count(*)::int` }).from(commissionRecords).where(eq(commissionRecords.ruleId, id));
  return { rule, usage };
}

export async function createCommissionRule(actor: Actor, input: unknown) {
  requirePermission(actor, "commission_rules.manage");
  const parsed = commissionRuleSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  return db.transaction(async (tx) => {
    const [rule] = await tx
      .insert(commissionRules)
      .values({ ...parsed.data, isIllustrative: false, createdById: actor.userId })
      .returning({ id: commissionRules.id });
    await recordAudit(tx, { actor: auditActor(actor), action: "commission_rule.created", entityType: "commission_rule", entityId: rule.id, after: parsed.data });
    return rule.id;
  });
}

/**
 * Rules referenced by commission records are immutable in their calculation terms (history must stay
 * reproducible): only name, description, active flag and end date may change. Create a new rule instead.
 */
export async function updateCommissionRule(actor: Actor, id: string, input: unknown) {
  requirePermission(actor, "commission_rules.manage");
  const parsed = commissionRuleSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(commissionRules).where(eq(commissionRules.id, id)).for("update").limit(1);
    if (!before) throw new NotFoundError();
    const [{ usage }] = await tx.select({ usage: sql<number>`count(*)::int` }).from(commissionRecords).where(eq(commissionRecords.ruleId, id));
    const data = parsed.data;
    if (usage > 0) {
      const changedTerms =
        before.calcType !== data.calcType ||
        (before.ratePercent ?? null) !== (data.ratePercent ? new Decimal(data.ratePercent).toFixed(4) : null) ||
        (before.fixedAmount ?? null) !== (data.fixedAmount ? new Decimal(data.fixedAmount).toFixed(2) : null) ||
        JSON.stringify(normalizeSlabs(before.slabs)) !== JSON.stringify(normalizeSlabs(data.slabs)) ||
        before.productId !== data.productId ||
        before.agentId !== data.agentId ||
        before.effectiveFrom !== data.effectiveFrom ||
        (before.capAmount ?? null) !== (data.capAmount ? new Decimal(data.capAmount).toFixed(2) : null) ||
        (before.minBaseAmount ?? null) !== (data.minBaseAmount ? new Decimal(data.minBaseAmount).toFixed(2) : null) ||
        (before.maxBaseAmount ?? null) !== (data.maxBaseAmount ? new Decimal(data.maxBaseAmount).toFixed(2) : null);
      if (changedTerms) {
        throw new BusinessRuleError("This rule has been used for commissions; its terms cannot change. Set an end date and create a new rule.");
      }
    }
    await tx.update(commissionRules).set({ ...data, updatedAt: new Date() }).where(eq(commissionRules.id, id));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "commission_rule.updated",
      entityType: "commission_rule",
      entityId: id,
      before: { ...before } as Record<string, unknown>,
      after: data as Record<string, unknown>,
    });
  });
}

export async function listCommissionStatusTotals(actor: Actor) {
  requirePermission(actor, "commissions.read_all");
  return db
    .select({ status: commissionRecords.status, n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(payable_amount),0)::text` })
    .from(commissionRecords)
    .groupBy(commissionRecords.status);
}


/** Commission payment records (append-only ledger). */
export async function listCommissionPayments(actor: Actor, opts: PageParams = {}) {
  requirePermission(actor, "commissions.read_all");
  const { page, pageSize, offset, limit } = pageArgs(opts);
  const rows = await db
    .select({
      id: commissionPayments.id,
      commissionId: commissionPayments.commissionId,
      amount: commissionPayments.amount,
      paymentReference: commissionPayments.paymentReference,
      paymentMethod: commissionPayments.paymentMethod,
      paidOn: commissionPayments.paidOn,
      notes: commissionPayments.notes,
      createdAt: commissionPayments.createdAt,
      reference: loanApplications.reference,
      agentName: users.name,
      agentCode: agents.agentCode,
      recordedByName: sql<string | null>`(select name from users u2 where u2.id = ${commissionPayments.recordedById})`,
    })
    .from(commissionPayments)
    .innerJoin(commissionRecords, eq(commissionRecords.id, commissionPayments.commissionId))
    .innerJoin(loanApplications, eq(loanApplications.id, commissionRecords.applicationId))
    .innerJoin(agents, eq(agents.id, commissionRecords.agentId))
    .innerJoin(users, eq(users.id, agents.userId))
    .orderBy(desc(commissionPayments.paidOn), desc(commissionPayments.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(commissionPayments);
  return paged(rows, total, page, pageSize);
}
