import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import Decimal from "decimal.js";
import { db, type DbOrTx } from "@/server/db/client";
import {
  agents,
  applicationAssignments,
  applicationStatusHistory,
  disbursements,
  informationRequests,
  lenderDecisions,
  loanApplications,
} from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";
import { canActAsApplicant, hasStaffAuthority } from "@/server/rbac/application-access";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { isActionPermitted, resolveTarget, TRANSITIONS, type WorkflowAction } from "@/lib/domain/workflow";
import { CUSTOMER_STATUS_EXPLANATIONS, DOCUMENT_CATEGORIES, type ApplicationStatusValue } from "@/lib/domain/labels";
import { isoDateSchema, moneySchema, reasonSchema } from "@/lib/validation/common";
import { templates } from "@/server/email/templates";
import { recordAudit } from "./audit";
import { loadApplication, type LoadedApplication } from "./application-access";
import { documentCompleteness } from "./applications";
import { createCommissionForDisbursement } from "./commissions";
import { appUrl, enqueueEmail, notifyUser, scheduleDispatch } from "./notifications";

interface TransitionOptions {
  reason?: string | null;
  patch?: Partial<typeof loanApplications.$inferInsert>;
  expectedVersion?: number;
}

/**
 * The single place where an application's status changes. Validates the transition against the state
 * machine, the actor's permission/scope (unless performed by the system), writes the status history and
 * the audit log in the caller's transaction.
 */
export async function applyTransition(tx: DbOrTx, loaded: LoadedApplication, action: WorkflowAction, actor: Actor | null, opts: TransitionOptions = {}) {
  const { app, facts } = loaded;
  const def = TRANSITIONS[action];
  const state = { status: app.status as ApplicationStatusValue, holdPreviousStatus: app.holdPreviousStatus as ApplicationStatusValue | null };
  const target = resolveTarget(action, state);
  if (!target) throw new BusinessRuleError(`"${def.label}" is not possible while the application is ${app.status.replace(/_/g, " ").toLowerCase()}.`);
  if (def.scope === "system") {
    // System transitions are only invoked by services as side effects; no direct user entry point exists.
  } else {
    if (!actor) throw new AuthorizationError();
    const ctx = {
      permissions: actor.permissions,
      isOwner: action === "withdraw" ? facts.customerUserId === actor.userId : canActAsApplicant(actor, facts),
      isAssignee: facts.activeAssigneeId === actor.userId,
    };
    if (!isActionPermitted(action, state, ctx)) throw new AuthorizationError();
  }
  if (def.requiresReason && (!opts.reason || opts.reason.trim().length < 3)) {
    throw new ValidationError(undefined, { reason: ["Please provide a reason"] });
  }
  if (opts.expectedVersion !== undefined && opts.expectedVersion !== app.version) throw new ConflictError();

  const now = new Date();
  await tx
    .update(loanApplications)
    .set({
      ...opts.patch,
      status: target,
      holdPreviousStatus: action === "put_on_hold" ? app.status : action === "resume" ? null : app.holdPreviousStatus,
      closedAt: target === "CLOSED" ? now : app.closedAt,
      version: sql`${loanApplications.version} + 1`,
      updatedAt: now,
    })
    .where(eq(loanApplications.id, app.id));
  await tx.insert(applicationStatusHistory).values({
    applicationId: app.id,
    fromStatus: app.status,
    toStatus: target,
    actorId: actor?.userId ?? null,
    reason: opts.reason ?? null,
    customerVisible: def.customerVisible,
  });
  await recordAudit(tx, {
    actor: actor ? auditActor(actor) : null,
    action: `application.${action}`,
    entityType: "loan_application",
    entityId: app.id,
    before: { status: app.status },
    after: { status: target },
    reason: opts.reason ?? null,
  });
  loaded.app = { ...app, status: target, version: app.version + 1 };
  return target;
}

/** Notifies the applicant (and the referring agent, if any) about a customer-visible change. */
async function notifyApplicantSide(
  tx: DbOrTx,
  loaded: LoadedApplication,
  kind: "status" | "decision" | "info" | "accepted" | "disbursed",
  dedupe: string,
) {
  const { app, customer } = loaded;
  const label = CUSTOMER_STATUS_EXPLANATIONS[app.status as ApplicationStatusValue].title;
  const url = appUrl(`/customer/applications/${app.id}`);
  const email =
    kind === "info"
      ? templates.informationRequested({ name: customer.fullName, reference: app.reference, url })
      : kind === "accepted"
        ? templates.documentsAccepted({ name: customer.fullName, reference: app.reference, url })
        : kind === "decision"
          ? templates.decisionRecorded({ name: customer.fullName, reference: app.reference, statusLabel: label, url })
          : kind === "disbursed"
            ? templates.disbursementRecorded({ name: customer.fullName, reference: app.reference, url })
            : templates.statusChanged({ name: customer.fullName, reference: app.reference, statusLabel: label, url });
  const template = { info: "information_requested", accepted: "documents_accepted", decision: "decision_recorded", disbursed: "disbursement_recorded", status: "status_changed" }[kind];
  if (customer.userId) {
    await notifyUser(tx, customer.userId, { template, email, linkPath: `/customer/applications/${app.id}`, entityType: "loan_application", entityId: app.id, dedupeKey: `${dedupe}:customer` });
  } else {
    await enqueueEmail(tx, { to: customer.email, template, email, entityType: "loan_application", entityId: app.id, dedupeKey: `${dedupe}:customer` });
  }
  if (app.referringAgentId) {
    const [agent] = await tx.select({ userId: agents.userId }).from(agents).where(eq(agents.id, app.referringAgentId)).limit(1);
    if (agent) {
      await notifyUser(tx, agent.userId, {
        template,
        email: templates.statusChanged({ name: "there", reference: app.reference, statusLabel: label, url: appUrl(`/agent/applications/${app.id}`) }),
        linkPath: `/agent/applications/${app.id}`,
        entityType: "loan_application",
        entityId: app.id,
        dedupeKey: `${dedupe}:agent`,
      });
    }
  }
}

function requireStaff(actor: Actor, loaded: LoadedApplication) {
  if (!hasStaffAuthority(actor, loaded.facts)) throw new NotFoundError();
}

async function finish<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  const result = await db.transaction(fn);
  scheduleDispatch();
  return result;
}

// ======================================================================= information requests

export const infoRequestSchema = z.object({
  message: z.string().trim().min(10, "Describe what is needed (min 10 characters)").max(2000),
  requestedCategories: z.array(z.enum(DOCUMENT_CATEGORIES)).max(10).default([]),
});

export async function requestInformation(actor: Actor, applicationId: string, input: unknown) {
  requirePermission(actor, "applications.request_information");
  const parsed = infoRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  return finish(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    requireStaff(actor, loaded);
    const [req] = await tx
      .insert(informationRequests)
      .values({ applicationId, requestedById: actor.userId, message: parsed.data.message, requestedCategories: parsed.data.requestedCategories })
      .returning({ id: informationRequests.id });
    if (loaded.app.status !== "INFORMATION_REQUIRED") {
      await applyTransition(tx, loaded, "request_information", actor, { reason: "Additional information requested" });
    } else {
      await recordAudit(tx, { actor: auditActor(actor), action: "application.information_requested", entityType: "loan_application", entityId: applicationId });
    }
    await notifyApplicantSide(tx, loaded, "info", `info-request:${req.id}`);
    return req.id;
  });
}

export const infoResponseSchema = z.object({ responseText: z.string().trim().min(2, "Enter a response").max(4000) });

/** Applicant responds to a request. When no requests remain open, the application returns to review. */
export async function respondToInformationRequest(actor: Actor, requestId: string, input: unknown) {
  requirePermission(actor, "applications.create");
  const parsed = infoResponseSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  return finish(async (tx) => {
    const [req] = await tx.select().from(informationRequests).where(eq(informationRequests.id, requestId)).for("update").limit(1);
    if (!req) throw new NotFoundError();
    const loaded = await loadApplication(tx, req.applicationId, { lock: true });
    if (!canActAsApplicant(actor, loaded.facts)) throw new NotFoundError();
    if (req.status !== "OPEN") throw new BusinessRuleError("This request has already been answered.");
    await tx
      .update(informationRequests)
      .set({ status: "RESPONDED", responseText: parsed.data.responseText, respondedById: actor.userId, respondedAt: new Date() })
      .where(eq(informationRequests.id, requestId));
    await recordAudit(tx, { actor: auditActor(actor), action: "information_request.responded", entityType: "information_request", entityId: requestId });
    const [{ open }] = await tx
      .select({ open: sql<number>`count(*)::int` })
      .from(informationRequests)
      .where(and(eq(informationRequests.applicationId, req.applicationId), eq(informationRequests.status, "OPEN")));
    if (open === 0 && loaded.app.status === "INFORMATION_REQUIRED") {
      await applyTransition(tx, loaded, "information_provided", null, { reason: "Applicant responded to information request" });
      if (loaded.facts.activeAssigneeId) {
        await notifyUser(tx, loaded.facts.activeAssigneeId, {
          template: "information_provided",
          email: templates.statusChanged({ name: "there", reference: loaded.app.reference, statusLabel: "Information provided — back in document review", url: appUrl(`/staff/applications/${loaded.app.id}`) }),
          linkPath: `/staff/applications/${loaded.app.id}`,
          entityType: "loan_application",
          entityId: loaded.app.id,
          dedupeKey: `info-provided:${requestId}`,
        });
      }
    }
  });
}

export async function resolveInformationRequest(actor: Actor, requestId: string, cancel = false) {
  requirePermission(actor, "applications.request_information");
  return finish(async (tx) => {
    const [req] = await tx.select().from(informationRequests).where(eq(informationRequests.id, requestId)).for("update").limit(1);
    if (!req) throw new NotFoundError();
    const loaded = await loadApplication(tx, req.applicationId, { lock: true });
    requireStaff(actor, loaded);
    if (!["OPEN", "RESPONDED"].includes(req.status)) throw new BusinessRuleError("This request is already closed.");
    await tx
      .update(informationRequests)
      .set({ status: cancel ? "CANCELLED" : "RESOLVED", resolvedById: actor.userId, resolvedAt: new Date() })
      .where(eq(informationRequests.id, requestId));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: cancel ? "information_request.cancelled" : "information_request.resolved",
      entityType: "information_request",
      entityId: requestId,
    });
    const [{ open }] = await tx
      .select({ open: sql<number>`count(*)::int` })
      .from(informationRequests)
      .where(and(eq(informationRequests.applicationId, req.applicationId), eq(informationRequests.status, "OPEN")));
    if (open === 0 && loaded.app.status === "INFORMATION_REQUIRED") {
      await applyTransition(tx, loaded, "information_provided", null, { reason: cancel ? "Information request cancelled" : "Information request resolved" });
    }
  });
}

// ======================================================================= documentation hand-off

/**
 * Loan Officer marks documentation complete. Requires every required document to be VERIFIED, no document
 * awaiting review and no unresolved information request. The officer's assignment is completed (hand-off)
 * and the application moves to the admin review queue. This does NOT approve the loan.
 */
export async function completeDocumentation(actor: Actor, applicationId: string, input: unknown) {
  const { notes, expectedVersion } = z
    .object({ notes: z.string().trim().max(2000).optional(), expectedVersion: z.coerce.number().int().optional() })
    .parse(input ?? {});
  return finish(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    requireStaff(actor, loaded);
    const completeness = await documentCompleteness(tx, loaded.app);
    if (completeness.verifiedMissing.length) {
      throw new BusinessRuleError(`These required documents are not verified yet: ${completeness.verifiedMissing.map((d) => d.label).join(", ")}.`);
    }
    if (completeness.pending.length) throw new BusinessRuleError("Review all pending documents before completing documentation.");
    const [{ unresolved }] = await tx
      .select({ unresolved: sql<number>`count(*)::int` })
      .from(informationRequests)
      .where(and(eq(informationRequests.applicationId, applicationId), inArray(informationRequests.status, ["OPEN", "RESPONDED"])));
    if (unresolved > 0) throw new BusinessRuleError("Resolve all information requests before completing documentation.");
    await applyTransition(tx, loaded, "complete_documentation", actor, { reason: notes || "Documentation verified and complete", expectedVersion });
    await tx
      .update(applicationAssignments)
      .set({ status: "COMPLETED", endedAt: new Date(), notes: notes ?? null })
      .where(and(eq(applicationAssignments.applicationId, applicationId), eq(applicationAssignments.status, "ACTIVE")));
    await notifyApplicantSide(tx, loaded, "accepted", `docs-accepted:${applicationId}`);
  });
}

// ======================================================================= generic staff transitions

const simpleActions = ["return_to_review", "lender_acknowledged", "put_on_hold", "resume", "close"] as const;

export async function performSimpleAction(actor: Actor, applicationId: string, action: (typeof simpleActions)[number], input: unknown) {
  if (!simpleActions.includes(action)) throw new ValidationError("Unsupported action");
  const { reason, expectedVersion } = z
    .object({ reason: z.string().trim().max(1000).optional(), expectedVersion: z.coerce.number().int().optional() })
    .parse(input ?? {});
  return finish(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    requireStaff(actor, loaded);
    await applyTransition(tx, loaded, action, actor, { reason, expectedVersion });
    if (TRANSITIONS[action].customerVisible) await notifyApplicantSide(tx, loaded, "status", `${action}:${applicationId}:${loaded.app.version}`);
  });
}

/** Customer withdraws their own application. */
export async function withdrawApplication(actor: Actor, applicationId: string, reasonInput: unknown) {
  requirePermission(actor, "applications.withdraw_own");
  const reason = reasonSchema.safeParse(reasonInput);
  if (!reason.success) throw new ValidationError(undefined, { reason: [reason.error.issues[0].message] });
  return finish(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    if (loaded.facts.customerUserId !== actor.userId) throw new NotFoundError();
    await applyTransition(tx, loaded, "withdraw", actor, { reason: reason.data });
    await tx
      .update(applicationAssignments)
      .set({ status: "RELEASED", endedAt: new Date() })
      .where(and(eq(applicationAssignments.applicationId, applicationId), eq(applicationAssignments.status, "ACTIVE")));
  });
}

// ======================================================================= internal review

export const internalReviewSchema = z.object({
  outcome: z.enum(["RECOMMENDED", "NOT_RECOMMENDED"]),
  notes: z.string().trim().min(5, "Add review notes").max(4000),
  expectedVersion: z.coerce.number().int().optional(),
});

export async function recordInternalReview(actor: Actor, applicationId: string, input: unknown) {
  const parsed = internalReviewSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const { outcome, notes, expectedVersion } = parsed.data;
  return finish(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    requireStaff(actor, loaded);
    await applyTransition(tx, loaded, outcome === "RECOMMENDED" ? "internal_recommend" : "internal_decline", actor, {
      reason: outcome === "RECOMMENDED" ? "Internal review: recommended for lender submission" : notes,
      expectedVersion,
      patch: { internalReviewOutcome: outcome, internalReviewNotes: notes, internalReviewedById: actor.userId, internalReviewedAt: new Date() },
    });
    await notifyApplicantSide(tx, loaded, outcome === "RECOMMENDED" ? "status" : "decision", `internal-review:${applicationId}`);
  });
}

export const submitToLenderSchema = z.object({
  lenderName: z.string().trim().min(2, "Enter the lender name").max(120),
  lenderReference: z.string().trim().max(80).optional(),
  expectedVersion: z.coerce.number().int().optional(),
});

export async function submitToLender(actor: Actor, applicationId: string, input: unknown) {
  const parsed = submitToLenderSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  return finish(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    requireStaff(actor, loaded);
    await applyTransition(tx, loaded, "submit_to_lender", actor, {
      reason: `Submitted to ${parsed.data.lenderName}`,
      expectedVersion: parsed.data.expectedVersion,
      patch: { lenderName: parsed.data.lenderName, lenderReference: parsed.data.lenderReference || null, submittedToLenderAt: new Date() },
    });
    await notifyApplicantSide(tx, loaded, "status", `submitted-to-lender:${applicationId}`);
  });
}

// ======================================================================= lender decision & disbursement

export const lenderDecisionSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    lenderName: z.string().trim().min(2).max(120),
    lenderReference: z.string().trim().max(80).optional(),
    approvedAmount: z.union([moneySchema, z.literal("")]).optional().transform((v) => (v ? v : undefined)),
    approvedTenureMonths: z.coerce.number().int().min(1).max(480).optional().or(z.literal("").transform(() => undefined)),
    decisionDate: isoDateSchema,
    evidenceNote: z.string().trim().min(10, "Describe the lender confirmation (e.g. sanction letter reference and date)").max(2000),
    expectedVersion: z.coerce.number().int().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "APPROVED" && (!v.approvedAmount || new Decimal(v.approvedAmount).lte(0))) {
      ctx.addIssue({ code: "custom", path: ["approvedAmount"], message: "Enter the lender-approved amount" });
    }
    if (v.decisionDate > new Date().toISOString().slice(0, 10)) ctx.addIssue({ code: "custom", path: ["decisionDate"], message: "Decision date cannot be in the future" });
  });

/**
 * Records the bank/NBFC decision from external confirmation (no lender integration is configured).
 * The lender decision is stored separately from the internal review outcome.
 */
export async function recordLenderDecision(actor: Actor, applicationId: string, input: unknown) {
  const parsed = lenderDecisionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const v = parsed.data;
  return finish(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    requireStaff(actor, loaded);
    const action = v.decision === "APPROVED" ? "record_lender_approval" : "record_lender_rejection";
    // Validate the transition before writing the decision row.
    if (!resolveTarget(action, { status: loaded.app.status as ApplicationStatusValue, holdPreviousStatus: null })) {
      throw new BusinessRuleError("A lender decision can only be recorded after the application was submitted to a lender.");
    }
    await tx.insert(lenderDecisions).values({
      applicationId,
      decision: v.decision,
      lenderName: v.lenderName,
      lenderReference: v.lenderReference || null,
      approvedAmount: v.decision === "APPROVED" ? new Decimal(v.approvedAmount!).toFixed(2) : null,
      approvedTenureMonths: v.decision === "APPROVED" ? (v.approvedTenureMonths ?? null) : null,
      decisionDate: v.decisionDate,
      evidenceNote: v.evidenceNote,
      recordedById: actor.userId,
    });
    await applyTransition(tx, loaded, action, actor, {
      reason: `Lender ${v.decision === "APPROVED" ? "approval" : "rejection"} recorded (${v.lenderName})`,
      expectedVersion: v.expectedVersion,
      patch: { lenderName: v.lenderName, lenderReference: v.lenderReference || loaded.app.lenderReference },
    });
    await notifyApplicantSide(tx, loaded, "decision", `lender-decision:${applicationId}`);
  });
}

export const disbursementSchema = z.object({
  amount: moneySchema,
  disbursedOn: isoDateSchema,
  lenderReference: z.string().trim().min(3, "Enter the lender's disbursement reference").max(80),
  confirmationSource: z.string().trim().min(10, "Describe how the disbursement was confirmed").max(1000),
  expectedVersion: z.coerce.number().int().optional(),
});

/**
 * Records a lender-confirmed disbursement and, in the same transaction, creates the commission record for
 * agent-referred applications (idempotent). Requires a recorded lender approval; the disbursed amount cannot
 * exceed the approved amount.
 */
export async function recordDisbursement(actor: Actor, applicationId: string, input: unknown) {
  const parsed = disbursementSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const v = parsed.data;
  if (v.disbursedOn > new Date().toISOString().slice(0, 10)) throw new ValidationError(undefined, { disbursedOn: ["Disbursement date cannot be in the future"] });
  return finish(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    requireStaff(actor, loaded);
    const [existing] = await tx.select({ id: disbursements.id }).from(disbursements).where(eq(disbursements.applicationId, applicationId)).limit(1);
    if (existing) throw new BusinessRuleError("A disbursement has already been recorded for this application.");
    const [approval] = await tx
      .select()
      .from(lenderDecisions)
      .where(and(eq(lenderDecisions.applicationId, applicationId), eq(lenderDecisions.decision, "APPROVED")))
      .orderBy(desc(lenderDecisions.createdAt))
      .limit(1);
    if (!approval) throw new BusinessRuleError("A lender approval must be recorded before a disbursement.");
    if (new Decimal(v.amount).gt(approval.approvedAmount!)) {
      throw new ValidationError(undefined, { amount: ["Disbursed amount cannot exceed the lender-approved amount"] });
    }
    if (v.disbursedOn < approval.decisionDate) throw new ValidationError(undefined, { disbursedOn: ["Disbursement cannot be dated before the lender decision"] });
    await applyTransition(tx, loaded, "record_disbursement", actor, { reason: "Lender-confirmed disbursement recorded", expectedVersion: v.expectedVersion });
    const amount = new Decimal(v.amount).toFixed(2);
    await tx.insert(disbursements).values({
      applicationId,
      amount,
      disbursedOn: v.disbursedOn,
      lenderReference: v.lenderReference,
      confirmationSource: v.confirmationSource,
      recordedById: actor.userId,
    });
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "disbursement.recorded",
      entityType: "loan_application",
      entityId: applicationId,
      after: { amount, disbursedOn: v.disbursedOn, lenderReference: v.lenderReference },
    });
    const commission = await createCommissionForDisbursement(tx, { applicationId, disbursedAmount: amount, disbursedOn: v.disbursedOn, actor });
    await notifyApplicantSide(tx, loaded, "disbursed", `disbursed:${applicationId}`);
    return { commissionId: commission?.id ?? null, commissionStatus: commission?.status ?? null };
  });
}
