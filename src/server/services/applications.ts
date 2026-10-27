import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import {
  agents,
  applicationAddresses,
  applicationApplicants,
  applicationAssignments,
  applicationBusiness,
  applicationDocuments,
  applicationEmployment,
  applicationNotes,
  applicationReferences,
  applicationStatusHistory,
  commissionRecords,
  customers,
  disbursements,
  informationRequests,
  lenderDecisions,
  loanApplications,
  loanProducts,
  users,
  type ApplicationStatus,
} from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requireAnyPermission, requirePermission } from "@/server/rbac/authorize";
import { canActAsApplicant, hasStaffAuthority, isApplicantSide } from "@/server/rbac/application-access";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { randomCode } from "@/server/auth/crypto";
import {
  DECLARATION_VERSION,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  submitSchema,
  type ProductLimits,
} from "@/lib/validation/application";
import { allowedActions, CLOSED_STATUSES, EDITABLE_STATUSES, type WorkflowAction } from "@/lib/domain/workflow";
import { APPLICATION_STATUSES, type ApplicationStatusValue } from "@/lib/domain/labels";
import type { ApplicantTypeValue } from "@/lib/domain/product-config";
import { templates } from "@/server/email/templates";
import { recordAudit } from "./audit";
import { ensureCustomerForActor } from "./customers";
import { resolveAttributionForNewApplication } from "./referrals";
import { getProductDocuments, requirementsFor } from "./products";
import { getSetting } from "./settings";
import { appUrl, enqueueEmail, notifyUser, scheduleDispatch } from "./notifications";
import { likePattern, pageArgs, paged, type PageParams } from "./pagination";
import { loadApplication, loadApplicationForView, type LoadedApplication } from "./application-access";

const MAX_DOCS_PER_CATEGORY = 5;

// ======================================================================= creation

export const createDraftSchema = z.object({
  productId: z.uuid("Select a loan product"),
  customerId: z.uuid().optional(),
});

/**
 * Creates a DRAFT application. Customer and attribution are derived on the server:
 *  - customers create for themselves (customerId input is ignored)
 *  - agents create for a customer they hold an ACTIVE referral for
 */
export async function createDraftApplication(actor: Actor, input: unknown): Promise<{ id: string; reference: string }> {
  requirePermission(actor, "applications.create");
  const parsed = createDraftSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);

  const result = await db.transaction(async (tx) => {
    const [product] = await tx.select().from(loanProducts).where(eq(loanProducts.id, parsed.data.productId)).limit(1);
    if (!product || !product.isActive) throw new ValidationError(undefined, { productId: ["This product is not currently available"] });

    let customerId: string;
    const actingAsAgent = !!actor.agentId && actor.permissions.has("referrals.create") && !!parsed.data.customerId;
    if (actingAsAgent) {
      customerId = parsed.data.customerId!;
    } else if (actor.permissions.has("portal.customer")) {
      customerId = await ensureCustomerForActor(actor, tx);
    } else {
      throw new AuthorizationError("Select a referred customer to start an application.");
    }

    // Serialize creation per customer so the open-application limit cannot be raced.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"app-create:" + customerId}))`);
    const maxOpen = await getSetting("applications.maxOpenPerCustomer");
    const [{ open }] = await tx
      .select({ open: sql<number>`count(*)::int` })
      .from(loanApplications)
      .where(and(eq(loanApplications.customerId, customerId), notInArray(loanApplications.status, [...CLOSED_STATUSES])));
    if (open >= maxOpen) {
      throw new BusinessRuleError(`A customer can have at most ${maxOpen} open applications. Continue or withdraw an existing one first.`);
    }

    const attribution = await resolveAttributionForNewApplication(tx, actor, customerId);
    const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer) throw new NotFoundError();

    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = `TL-${product.referencePrefix}-${randomCode(8)}`;
      try {
        const [app] = await tx
          .insert(loanApplications)
          .values({
            reference,
            customerId,
            productId: product.id,
            status: "DRAFT",
            acquisitionSource: attribution.acquisitionSource,
            referringAgentId: attribution.referringAgentId,
            referralId: attribution.referralId,
            createdById: actor.userId,
          })
          .returning({ id: loanApplications.id, reference: loanApplications.reference });
        await tx.insert(applicationStatusHistory).values({
          applicationId: app.id,
          fromStatus: null,
          toStatus: "DRAFT",
          actorId: actor.userId,
          reason: "Application started",
        });
        await recordAudit(tx, {
          actor: auditActor(actor),
          action: "application.created",
          entityType: "loan_application",
          entityId: app.id,
          after: { reference, productId: product.id, customerId, ...attribution },
        });
        return { ...app, prefill: customer };
      } catch (e) {
        if (!isUniqueViolation(e, "loan_applications_reference_unique")) throw e;
      }
    }
    throw new Error("Could not allocate a unique application reference");
  });
  return { id: result.id, reference: result.reference };
}

// ======================================================================= wizard state

function productLimits(product: typeof loanProducts.$inferSelect): ProductLimits {
  return { minAmount: product.minAmount, maxAmount: product.maxAmount, config: product.config };
}

async function loadStepData(conn: DbOrTx, applicationId: string) {
  const [applicant] = await conn.select().from(applicationApplicants).where(eq(applicationApplicants.applicationId, applicationId)).limit(1);
  const addresses = await conn.select().from(applicationAddresses).where(eq(applicationAddresses.applicationId, applicationId));
  const refs = await conn
    .select()
    .from(applicationReferences)
    .where(eq(applicationReferences.applicationId, applicationId))
    .orderBy(asc(applicationReferences.position));
  const [employment] = await conn.select().from(applicationEmployment).where(eq(applicationEmployment.applicationId, applicationId)).limit(1);
  const [business] = await conn.select().from(applicationBusiness).where(eq(applicationBusiness.applicationId, applicationId)).limit(1);
  return { applicant, addresses, refs, employment, business };
}

const undef = <T,>(v: T | null | undefined) => (v === null ? undefined : v);

function addressInput(a: typeof applicationAddresses.$inferSelect | undefined) {
  if (!a) return undefined;
  return {
    line1: a.line1,
    line2: undef(a.line2) ?? "",
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: "India",
    yearsAtAddress: undef(a.yearsAtAddress),
  };
}

/** Rebuilds wizard inputs from persisted rows (used to prefill the UI and to re-validate on submit). */
function toStepInputs(app: typeof loanApplications.$inferSelect, data: Awaited<ReturnType<typeof loadStepData>>) {
  const current = data.addresses.find((a) => a.type === "CURRENT");
  const permanent = data.addresses.find((a) => a.type === "PERMANENT");
  return {
    step1: data.applicant
      ? {
          fullName: data.applicant.fullName,
          dateOfBirth: data.applicant.dateOfBirth,
          mobile: data.applicant.mobile,
          email: data.applicant.email,
          identityDocumentType: data.applicant.identityDocumentType ?? "",
          identityNumberLast4: data.applicant.identityNumberLast4 ?? "",
        }
      : null,
    step2: current
      ? {
          currentAddress: addressInput(current)!,
          permanentSameAsCurrent: data.applicant?.permanentSameAsCurrent ?? true,
          permanentAddress: addressInput(permanent),
          references: data.refs.map((r) => ({ fullName: r.fullName, relationship: r.relationship, mobile: r.mobile, city: undef(r.city) ?? "" })),
          referenceConsent: !!app.referenceConsentAt,
        }
      : null,
    step3: app.applicantType
      ? {
          applicantType: app.applicantType,
          employment: data.employment
            ? {
                employerName: data.employment.employerName,
                jobTitle: data.employment.jobTitle,
                employmentType: data.employment.employmentType,
                workExperienceMonths: data.employment.workExperienceMonths,
                monthlyIncome: data.employment.monthlyIncome,
              }
            : undefined,
          business: data.business
            ? {
                businessName: data.business.businessName,
                businessType: data.business.businessType,
                registrationNumber: undef(data.business.registrationNumber) ?? "",
                businessAddress: data.business.businessAddress,
                yearsInOperation: data.business.yearsInOperation,
                annualTurnover: data.business.annualTurnover,
                annualIncome: undef(data.business.annualIncome) ?? "",
              }
            : undefined,
        }
      : null,
    step4: app.requestedAmount
      ? {
          requestedAmount: app.requestedAmount,
          requestedTenureMonths: app.requestedTenureMonths ?? undefined,
          loanPurpose: app.loanPurpose ?? "",
          productDetails: app.productDetails ?? {},
        }
      : null,
  };
}

async function listActiveDocuments(conn: DbOrTx, applicationId: string) {
  return conn
    .select({
      id: applicationDocuments.id,
      category: applicationDocuments.category,
      originalFilename: applicationDocuments.originalFilename,
      sizeBytes: applicationDocuments.sizeBytes,
      mimeType: applicationDocuments.mimeType,
      status: applicationDocuments.status,
      scanStatus: applicationDocuments.scanStatus,
      uploadedAt: applicationDocuments.uploadedAt,
      uploadedById: applicationDocuments.uploadedById,
      rejectionReason: applicationDocuments.rejectionReason,
      reviewedAt: applicationDocuments.reviewedAt,
    })
    .from(applicationDocuments)
    .where(and(eq(applicationDocuments.applicationId, applicationId), inArray(applicationDocuments.status, ["PENDING_REVIEW", "VERIFIED", "REJECTED"])))
    .orderBy(asc(applicationDocuments.uploadedAt));
}

/** Everything the wizard needs. Applicant side only (customer owner or creating agent). */
export async function getWizardState(actor: Actor, applicationId: string) {
  const loaded = await loadApplication(db, applicationId);
  if (!canActAsApplicant(actor, loaded.facts)) throw new NotFoundError();
  const { app, customer } = loaded;
  const [product] = await db.select().from(loanProducts).where(eq(loanProducts.id, app.productId)).limit(1);
  const docsReq = await getProductDocuments(db, product.id);
  const stepData = await loadStepData(db, app.id);
  const inputs = toStepInputs(app, stepData);
  return {
    application: {
      id: app.id,
      reference: app.reference,
      status: app.status,
      version: app.version,
      currentStep: app.currentStep,
      completedSteps: app.completedSteps,
      applicantType: app.applicantType,
      acquisitionSource: app.acquisitionSource,
      createdByAgent: !!app.referringAgentId && app.createdById !== customer.userId,
    },
    product: {
      id: product.id,
      name: product.name,
      currency: product.currency,
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      config: product.config,
      isIllustrative: product.isIllustrative,
    },
    documentRequirements: docsReq.map((d) => ({
      category: d.category,
      label: d.label,
      description: d.description,
      isRequired: d.isRequired,
      applicantTypes: d.applicantTypes,
    })),
    prefill: { fullName: customer.fullName, email: customer.email, mobile: customer.mobile },
    inputs,
    documents: await listActiveDocuments(db, app.id),
    editable: (EDITABLE_STATUSES as readonly string[]).includes(app.status),
  };
}

export type WizardState = Awaited<ReturnType<typeof getWizardState>>;

// ======================================================================= saving steps

function assertEditable(actor: Actor, loaded: LoadedApplication, expectedVersion: number) {
  if (!canActAsApplicant(actor, loaded.facts)) throw new NotFoundError();
  if (!(EDITABLE_STATUSES as readonly string[]).includes(loaded.app.status)) {
    throw new BusinessRuleError("This application has been submitted and can no longer be edited.");
  }
  if (loaded.app.version !== expectedVersion) throw new ConflictError();
}

function assertPreviousStepsDone(completed: number[], step: number) {
  for (let s = 1; s < step; s++) if (!completed.includes(s)) throw new BusinessRuleError(`Please complete step ${s} first.`);
}

function fieldErrorsOf(error: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

const stepInputSchema = z.object({ expectedVersion: z.coerce.number().int().min(1), data: z.unknown().optional() });
function parseStepInput(input: unknown) {
  const parsed = stepInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid request. Reload the page and try again.");
  return parsed.data;
}

/**
 * Saves one wizard step (1-4) after authoritative server-side validation against the product configuration.
 * Uses optimistic concurrency (expectedVersion) and returns the new version.
 */
export async function saveApplicationStep(actor: Actor, applicationId: string, step: 1 | 2 | 3 | 4, input: unknown) {
  requirePermission(actor, "applications.create");
  const { expectedVersion, data } = parseStepInput(input);
  return db.transaction(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    assertEditable(actor, loaded, expectedVersion);
    const { app } = loaded;
    assertPreviousStepsDone(app.completedSteps, step);
    const [product] = await tx.select().from(loanProducts).where(eq(loanProducts.id, app.productId)).limit(1);
    const config = product.config;
    let completed = new Set(app.completedSteps);
    const patch: Partial<typeof loanApplications.$inferInsert> = {};

    if (step === 1) {
      const parsed = step1Schema(config).safeParse(data);
      if (!parsed.success) throw new ValidationError(undefined, fieldErrorsOf(parsed.error));
      const v = parsed.data;
      const values = {
        applicationId,
        fullName: v.fullName,
        dateOfBirth: v.dateOfBirth,
        mobile: v.mobile,
        email: v.email,
        identityDocumentType: v.identityDocumentType,
        identityNumberLast4: v.identityNumberLast4,
        updatedAt: new Date(),
      };
      await tx.insert(applicationApplicants).values(values).onConflictDoUpdate({ target: applicationApplicants.applicationId, set: values });
    } else if (step === 2) {
      const parsed = step2Schema(config).safeParse(data);
      if (!parsed.success) throw new ValidationError(undefined, fieldErrorsOf(parsed.error));
      const v = parsed.data;
      const applicantMobile = (
        await tx.select({ m: applicationApplicants.mobile }).from(applicationApplicants).where(eq(applicationApplicants.applicationId, applicationId))
      )[0]?.m;
      const refIndex = v.references.findIndex((r) => r.mobile === applicantMobile);
      if (refIndex >= 0) {
        throw new ValidationError(undefined, { [`references.${refIndex}.mobile`]: ["A reference cannot use the applicant's own mobile number"] });
      }
      const addr = (type: "CURRENT" | "PERMANENT", a: (typeof v)["currentAddress"]) => ({
        applicationId,
        type,
        line1: a.line1,
        line2: a.line2 ?? null,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        country: a.country,
        yearsAtAddress: a.yearsAtAddress ?? null,
      });
      await tx.delete(applicationAddresses).where(eq(applicationAddresses.applicationId, applicationId));
      await tx.insert(applicationAddresses).values(addr("CURRENT", v.currentAddress));
      if (!v.permanentSameAsCurrent && v.permanentAddress) await tx.insert(applicationAddresses).values(addr("PERMANENT", v.permanentAddress));
      await tx
        .update(applicationApplicants)
        .set({ permanentSameAsCurrent: v.permanentSameAsCurrent })
        .where(eq(applicationApplicants.applicationId, applicationId));
      await tx.delete(applicationReferences).where(eq(applicationReferences.applicationId, applicationId));
      if (v.references.length) {
        await tx.insert(applicationReferences).values(
          v.references.map((r, i) => ({ applicationId, position: i + 1, fullName: r.fullName, relationship: r.relationship, mobile: r.mobile, city: r.city ?? null })),
        );
      }
      patch.referenceConsentAt = v.referenceConsent ? (app.referenceConsentAt ?? new Date()) : null;
    } else if (step === 3) {
      const parsed = step3Schema(config).safeParse(data);
      if (!parsed.success) throw new ValidationError(undefined, fieldErrorsOf(parsed.error));
      const v = parsed.data;
      if (app.applicantType && app.applicantType !== v.applicantType) {
        // Product-specific fields and required documents may differ by applicant type.
        completed.delete(4);
        completed.delete(5);
      }
      patch.applicantType = v.applicantType;
      if (v.employment) {
        const e = { applicationId, ...v.employment };
        await tx.insert(applicationEmployment).values(e).onConflictDoUpdate({ target: applicationEmployment.applicationId, set: e });
        await tx.delete(applicationBusiness).where(eq(applicationBusiness.applicationId, applicationId));
      } else if (v.business) {
        const b = {
          applicationId,
          businessName: v.business.businessName,
          businessType: v.business.businessType,
          registrationNumber: v.business.registrationNumber ?? null,
          businessAddress: v.business.businessAddress,
          yearsInOperation: v.business.yearsInOperation,
          annualTurnover: v.business.annualTurnover,
          annualIncome: v.business.annualIncome ?? null,
        };
        await tx.insert(applicationBusiness).values(b).onConflictDoUpdate({ target: applicationBusiness.applicationId, set: b });
        await tx.delete(applicationEmployment).where(eq(applicationEmployment.applicationId, applicationId));
      }
    } else if (step === 4) {
      const parsed = step4Schema(productLimits(product), app.applicantType as ApplicantTypeValue).safeParse(data);
      if (!parsed.success) throw new ValidationError(undefined, fieldErrorsOf(parsed.error));
      const v = parsed.data;
      patch.requestedAmount = v.requestedAmount;
      patch.requestedTenureMonths = v.requestedTenureMonths;
      patch.loanPurpose = v.loanPurpose;
      patch.productDetails = v.productDetails as Record<string, string | number | null>;
    }

    completed.add(step);
    completed = new Set([...completed].sort());
    const [updated] = await tx
      .update(loanApplications)
      .set({
        ...patch,
        completedSteps: [...completed],
        currentStep: Math.max(app.currentStep, Math.min(step + 1, 5)),
        version: sql`${loanApplications.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(loanApplications.id, applicationId), eq(loanApplications.version, expectedVersion)))
      .returning({ version: loanApplications.version });
    if (!updated) throw new ConflictError();
    return { version: updated.version, completedSteps: [...completed] };
  });
}

/** Document completeness for an application (required categories present, nothing infected). */
export async function documentCompleteness(conn: DbOrTx, app: { id: string; productId: string; applicantType: string | null }) {
  const reqs = requirementsFor(await getProductDocuments(conn, app.productId), app.applicantType as ApplicantTypeValue);
  const docs = await listActiveDocuments(conn, app.id);
  const usable = docs.filter((d) => d.status !== "REJECTED" && d.scanStatus !== "INFECTED");
  const missing = reqs.filter((r) => r.isRequired && !usable.some((d) => d.category === r.category));
  const verifiedMissing = reqs.filter((r) => r.isRequired && !docs.some((d) => d.category === r.category && d.status === "VERIFIED"));
  const pending = docs.filter((d) => d.status === "PENDING_REVIEW");
  return { requirements: reqs, documents: docs, missing, verifiedMissing, pending };
}

export async function completeDocumentsStep(actor: Actor, applicationId: string, input: unknown) {
  requirePermission(actor, "applications.create");
  const { expectedVersion } = parseStepInput(input);
  return db.transaction(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    assertEditable(actor, loaded, expectedVersion);
    assertPreviousStepsDone(loaded.app.completedSteps, 5);
    const { missing } = await documentCompleteness(tx, loaded.app);
    if (missing.length) throw new BusinessRuleError(`Please upload: ${missing.map((m) => m.label).join(", ")}.`);
    const completed = [...new Set([...loaded.app.completedSteps, 5])].sort();
    const [updated] = await tx
      .update(loanApplications)
      .set({ completedSteps: completed, version: sql`${loanApplications.version} + 1`, updatedAt: new Date() })
      .where(and(eq(loanApplications.id, applicationId), eq(loanApplications.version, expectedVersion)))
      .returning({ version: loanApplications.version });
    if (!updated) throw new ConflictError();
    return { version: updated.version };
  });
}

// ======================================================================= submission

/**
 * Submits a draft. Idempotent: a repeated submit (double click, retry) returns the already-submitted
 * application instead of failing or creating side effects twice. All step data is re-validated
 * against the current product configuration before the status changes.
 */
export async function submitApplication(actor: Actor, applicationId: string, input: unknown) {
  requirePermission(actor, "applications.create");
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);

  const outcome = await db.transaction(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    const { app, customer, facts } = loaded;
    if (!canActAsApplicant(actor, facts)) throw new NotFoundError();
    if (app.status !== "DRAFT") {
      if (app.submittedAt) return { alreadySubmitted: true as const, reference: app.reference };
      throw new BusinessRuleError("This application can no longer be submitted.");
    }
    if (app.version !== parsed.data.expectedVersion) throw new ConflictError();

    const [product] = await tx.select().from(loanProducts).where(eq(loanProducts.id, app.productId)).limit(1);
    if (!product.isActive) throw new BusinessRuleError("This loan product is no longer accepting applications.");
    const inputs = toStepInputs(app, await loadStepData(tx, app.id));
    const problems: string[] = [];
    if (!inputs.step1 || !step1Schema(product.config).safeParse(inputs.step1).success) problems.push("Step 1 (personal information)");
    if (!inputs.step2 || !step2Schema(product.config).safeParse(inputs.step2).success) problems.push("Step 2 (address and references)");
    if (!inputs.step3 || !step3Schema(product.config).safeParse(inputs.step3).success) problems.push("Step 3 (employment / business)");
    if (!inputs.step4 || !step4Schema(productLimits(product), app.applicantType as ApplicantTypeValue).safeParse(inputs.step4).success)
      problems.push("Step 4 (loan requirement)");
    const { missing } = await documentCompleteness(tx, app);
    if (missing.length) problems.push(`Step 5 (documents: ${missing.map((m) => m.label).join(", ")})`);
    if (problems.length) throw new BusinessRuleError(`Please review and complete: ${problems.join("; ")}.`);

    const now = new Date();
    await tx
      .update(loanApplications)
      .set({
        status: "SUBMITTED",
        submittedAt: now,
        submittedById: actor.userId,
        declarationAcceptedAt: now,
        declarationVersion: DECLARATION_VERSION,
        declarationAcceptedById: actor.userId,
        completedSteps: [1, 2, 3, 4, 5],
        version: sql`${loanApplications.version} + 1`,
        updatedAt: now,
      })
      .where(eq(loanApplications.id, app.id));
    await tx.insert(applicationStatusHistory).values({
      applicationId: app.id,
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      actorId: actor.userId,
      reason: actor.agentId && !facts.customerUserId ? "Submitted by referring agent with customer consent" : "Submitted",
    });
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "application.submitted",
      entityType: "loan_application",
      entityId: app.id,
      before: { status: "DRAFT" },
      after: { status: "SUBMITTED", declarationVersion: DECLARATION_VERSION },
    });

    const email = templates.applicationSubmitted({ name: customer.fullName, reference: app.reference, url: appUrl(`/customer/applications/${app.id}`) });
    if (customer.userId) {
      await notifyUser(tx, customer.userId, {
        template: "application_submitted",
        email,
        linkPath: `/customer/applications/${app.id}`,
        entityType: "loan_application",
        entityId: app.id,
        dedupeKey: `submitted:${app.id}`,
      });
    } else {
      await enqueueEmail(tx, { to: customer.email, template: "application_submitted", email, dedupeKey: `submitted:${app.id}` });
    }
    if (app.referringAgentId) {
      const [agent] = await tx.select({ userId: agents.userId }).from(agents).where(eq(agents.id, app.referringAgentId)).limit(1);
      if (agent && agent.userId !== actor.userId) {
        await notifyUser(tx, agent.userId, {
          template: "application_submitted",
          email: templates.statusChanged({ name: "there", reference: app.reference, statusLabel: "Submitted", url: appUrl(`/agent/applications/${app.id}`) }),
          linkPath: `/agent/applications/${app.id}`,
          entityType: "loan_application",
          entityId: app.id,
          dedupeKey: `submitted-agent:${app.id}`,
        });
      }
    }
    return { alreadySubmitted: false as const, reference: app.reference };
  });
  scheduleDispatch();
  return outcome;
}

// ======================================================================= listing

export type ListScope = "all" | "assigned" | "own" | "referred";

export interface ApplicationFilters extends PageParams {
  q?: string;
  status?: string;
  productId?: string;
  source?: string;
  assigneeId?: string;
  from?: string;
  to?: string;
  sort?: "newest" | "oldest" | "updated" | "amount_desc" | "amount_asc";
}

function scopeCondition(actor: Actor, scope: ListScope): SQL {
  switch (scope) {
    case "all":
      requirePermission(actor, "applications.read_all");
      return sql`true`;
    case "assigned":
      requirePermission(actor, "applications.read_assigned");
      return sql`exists (select 1 from application_assignments aa where aa.application_id = ${qcol(loanApplications.id)} and aa.assignee_id = ${actor.userId} and aa.status = 'ACTIVE')`;
    case "own":
      requirePermission(actor, "applications.read_own");
      return sql`${customers.userId} = ${actor.userId}`;
    case "referred":
      requirePermission(actor, "applications.read_referred");
      if (!actor.agentId) return sql`false`;
      return eq(loanApplications.referringAgentId, actor.agentId);
  }
}

export async function listApplications(actor: Actor, scope: ListScope, f: ApplicationFilters) {
  const { page, pageSize, offset, limit } = pageArgs(f);
  const conds: SQL[] = [scopeCondition(actor, scope)];
  if (f.status && (APPLICATION_STATUSES as readonly string[]).includes(f.status)) conds.push(eq(loanApplications.status, f.status as ApplicationStatus));
  if (f.status === "OPEN") conds.push(notInArray(loanApplications.status, [...CLOSED_STATUSES, "DRAFT"]));
  if (f.productId && z.uuid().safeParse(f.productId).success) conds.push(eq(loanApplications.productId, f.productId));
  if (f.source === "DIRECT" || f.source === "AGENT_REFERRAL") conds.push(eq(loanApplications.acquisitionSource, f.source));
  if (f.assigneeId && z.uuid().safeParse(f.assigneeId).success && scope === "all") {
    conds.push(sql`exists (select 1 from application_assignments aa where aa.application_id = ${qcol(loanApplications.id)} and aa.assignee_id = ${f.assigneeId} and aa.status = 'ACTIVE')`);
  }
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(gte(loanApplications.createdAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(lte(loanApplications.createdAt, new Date(`${f.to}T23:59:59Z`)));
  if (f.q) conds.push(or(ilike(loanApplications.reference, likePattern(f.q)), ilike(customers.fullName, likePattern(f.q)))!);
  const where = and(...conds);

  const orderBy = {
    newest: [desc(loanApplications.createdAt)],
    oldest: [asc(loanApplications.createdAt)],
    updated: [desc(loanApplications.updatedAt)],
    amount_desc: [sql`${loanApplications.requestedAmount} desc nulls last`],
    amount_asc: [sql`${loanApplications.requestedAmount} asc nulls last`],
  }[f.sort ?? "newest"];

  const internal = scope === "all" || scope === "assigned";
  const rows = await db
    .select({
      id: loanApplications.id,
      reference: loanApplications.reference,
      status: loanApplications.status,
      productName: loanProducts.name,
      currency: loanProducts.currency,
      customerName: customers.fullName,
      requestedAmount: loanApplications.requestedAmount,
      acquisitionSource: loanApplications.acquisitionSource,
      submittedAt: loanApplications.submittedAt,
      createdAt: loanApplications.createdAt,
      updatedAt: loanApplications.updatedAt,
      currentStep: loanApplications.currentStep,
      agentName: internal
        ? sql<string | null>`(select u.name from agents a join users u on u.id = a.user_id where a.id = ${qcol(loanApplications.referringAgentId)})`
        : sql<string | null>`null`,
      assigneeName: internal
        ? sql<string | null>`(select u.name from application_assignments aa join users u on u.id = aa.assignee_id where aa.application_id = ${qcol(loanApplications.id)} and aa.status = 'ACTIVE' limit 1)`
        : sql<string | null>`null`,
      openRequests: sql<number>`(select count(*)::int from information_requests ir where ir.application_id = ${qcol(loanApplications.id)} and ir.status = 'OPEN')`,
    })
    .from(loanApplications)
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .innerJoin(loanProducts, eq(loanProducts.id, loanApplications.productId))
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(loanApplications)
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .where(where);
  return paged(rows, total, page, pageSize);
}

// ======================================================================= detail

/**
 * Application detail shaped by the caller's view level. Customers and agents never receive internal
 * notes, internal review comments, assignment details or audit data.
 */
export async function getApplicationDetail(actor: Actor, applicationId: string) {
  const loaded = await loadApplicationForView(db, actor, applicationId);
  const { app, customer, facts, level } = loaded;
  const internal = level === "admin" || level === "staff";
  const [product] = await db.select().from(loanProducts).where(eq(loanProducts.id, app.productId)).limit(1);
  const stepData = await loadStepData(db, app.id);
  const completeness = await documentCompleteness(db, app);

  const history = await db
    .select({
      id: applicationStatusHistory.id,
      fromStatus: applicationStatusHistory.fromStatus,
      toStatus: applicationStatusHistory.toStatus,
      reason: applicationStatusHistory.reason,
      customerVisible: applicationStatusHistory.customerVisible,
      createdAt: applicationStatusHistory.createdAt,
      actorName: users.name,
    })
    .from(applicationStatusHistory)
    .leftJoin(users, eq(users.id, applicationStatusHistory.actorId))
    .where(eq(applicationStatusHistory.applicationId, app.id))
    .orderBy(asc(applicationStatusHistory.createdAt));

  const requests = await db
    .select({
      id: informationRequests.id,
      message: informationRequests.message,
      requestedCategories: informationRequests.requestedCategories,
      status: informationRequests.status,
      responseText: informationRequests.responseText,
      respondedAt: informationRequests.respondedAt,
      createdAt: informationRequests.createdAt,
      resolvedAt: informationRequests.resolvedAt,
    })
    .from(informationRequests)
    .where(and(eq(informationRequests.applicationId, app.id), sql`${informationRequests.status} <> 'CANCELLED'`))
    .orderBy(desc(informationRequests.createdAt));

  const notes = await db
    .select({
      id: applicationNotes.id,
      body: applicationNotes.body,
      visibility: applicationNotes.visibility,
      createdAt: applicationNotes.createdAt,
      authorName: users.name,
    })
    .from(applicationNotes)
    .innerJoin(users, eq(users.id, applicationNotes.authorId))
    .where(and(eq(applicationNotes.applicationId, app.id), internal ? sql`true` : eq(applicationNotes.visibility, "CUSTOMER_VISIBLE")))
    .orderBy(desc(applicationNotes.createdAt));

  const decisions = await db.select().from(lenderDecisions).where(eq(lenderDecisions.applicationId, app.id)).orderBy(desc(lenderDecisions.createdAt));
  const [disbursement] = await db.select().from(disbursements).where(eq(disbursements.applicationId, app.id)).limit(1);

  let agentInfo: { name: string; agentCode: string } | null = null;
  if (app.referringAgentId && internal) {
    const [a] = await db
      .select({ name: users.name, agentCode: agents.agentCode })
      .from(agents)
      .innerJoin(users, eq(users.id, agents.userId))
      .where(eq(agents.id, app.referringAgentId))
      .limit(1);
    agentInfo = a ?? null;
  }

  const assignments = internal
    ? await db
        .select({
          id: applicationAssignments.id,
          assigneeId: applicationAssignments.assigneeId,
          assigneeName: users.name,
          stage: applicationAssignments.stage,
          status: applicationAssignments.status,
          notes: applicationAssignments.notes,
          assignedAt: applicationAssignments.assignedAt,
          endedAt: applicationAssignments.endedAt,
          assignedByName: sql<string | null>`(select name from users where id = ${applicationAssignments.assignedById})`,
        })
        .from(applicationAssignments)
        .innerJoin(users, eq(users.id, applicationAssignments.assigneeId))
        .where(eq(applicationAssignments.applicationId, app.id))
        .orderBy(desc(applicationAssignments.assignedAt))
    : [];

  const commission =
    internal && actor.permissions.has("commissions.read_all")
      ? ((await db.select().from(commissionRecords).where(eq(commissionRecords.applicationId, app.id)).limit(1))[0] ?? null)
      : null;

  const ctx = {
    permissions: actor.permissions,
    isOwner: actor.permissions.has("applications.withdraw_own") ? facts.customerUserId === actor.userId : isApplicantSide(actor, facts),
    isAssignee: facts.activeAssigneeId === actor.userId,
  };
  const actions: WorkflowAction[] = allowedActions({ status: app.status as ApplicationStatusValue, holdPreviousStatus: app.holdPreviousStatus as ApplicationStatusValue | null }, ctx);
  const latestApproval = decisions.find((d) => d.decision === "APPROVED") ?? null;

  return {
    level,
    canActAsApplicant: canActAsApplicant(actor, facts),
    hasStaffAuthority: hasStaffAuthority(actor, facts),
    actions,
    application: {
      id: app.id,
      reference: app.reference,
      status: app.status,
      version: app.version,
      applicantType: app.applicantType,
      requestedAmount: app.requestedAmount,
      requestedTenureMonths: app.requestedTenureMonths,
      loanPurpose: app.loanPurpose,
      productDetails: app.productDetails,
      submittedAt: app.submittedAt,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      currentStep: app.currentStep,
      holdPreviousStatus: app.holdPreviousStatus,
      // Attribution is visible to staff; agents know their own referrals; customers do not need it.
      acquisitionSource: level === "customer" ? null : app.acquisitionSource,
      referringAgentId: internal ? app.referringAgentId : null,
      internalReviewOutcome: internal ? app.internalReviewOutcome : null,
      internalReviewNotes: internal ? app.internalReviewNotes : null,
      internalReviewedAt: internal ? app.internalReviewedAt : null,
      lenderName: internal ? app.lenderName : null,
      lenderReference: internal ? app.lenderReference : null,
    },
    product: { id: product.id, name: product.name, currency: product.currency, config: product.config },
    customer: { id: customer.id, fullName: customer.fullName, email: customer.email, mobile: customer.mobile, hasAccount: !!customer.userId },
    applicant: stepData.applicant ?? null,
    addresses: stepData.addresses,
    references: level === "agent" ? [] : stepData.refs,
    employment: stepData.employment ?? null,
    business: stepData.business ?? null,
    documents: completeness.documents.map((d) => ({
      ...d,
      canDownload: internal || level === "customer" || (level === "agent" && d.uploadedById === actor.userId),
    })),
    documentRequirements: completeness.requirements.map((r) => ({ category: r.category, label: r.label, isRequired: r.isRequired })),
    missingDocuments: completeness.missing.map((m) => m.label),
    unverifiedRequired: completeness.verifiedMissing.map((m) => m.label),
    pendingDocumentCount: completeness.pending.length,
    history: history
      .filter((h) => internal || h.customerVisible)
      .map((h) => ({ ...h, actorName: internal ? h.actorName : null })),
    informationRequests: requests,
    notes,
    lenderDecision: latestApproval
      ? {
          decision: latestApproval.decision,
          approvedAmount: latestApproval.approvedAmount,
          approvedTenureMonths: latestApproval.approvedTenureMonths,
          decisionDate: latestApproval.decisionDate,
          lenderName: latestApproval.lenderName,
        }
      : decisions[0]
        ? { decision: decisions[0].decision, approvedAmount: null, approvedTenureMonths: null, decisionDate: decisions[0].decisionDate, lenderName: decisions[0].lenderName }
        : null,
    lenderDecisions: internal ? decisions : [],
    disbursement: disbursement
      ? { amount: disbursement.amount, disbursedOn: disbursement.disbursedOn, lenderReference: internal ? disbursement.lenderReference : null }
      : null,
    agent: agentInfo,
    assignments,
    commission,
  };
}

export type ApplicationDetail = Awaited<ReturnType<typeof getApplicationDetail>>;

/** Lightweight summary for dashboards (counts by status) restricted to the actor's scope. */
export async function countApplicationsByStatus(actor: Actor, scope: ListScope) {
  requireAnyPermission(actor, "applications.read_all", "applications.read_assigned", "applications.read_own", "applications.read_referred");
  const rows = await db
    .select({ status: loanApplications.status, n: sql<number>`count(*)::int` })
    .from(loanApplications)
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .where(scopeCondition(actor, scope))
    .groupBy(loanApplications.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ApplicationStatusValue, number>>;
}

export { MAX_DOCS_PER_CATEGORY };
