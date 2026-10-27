import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { getApplicationDetail } from "@/server/services/applications";
import { reviewDocument, uploadDocument } from "@/server/services/documents";
import { assignApplication } from "@/server/services/assignments";
import {
  completeDocumentation,
  performSimpleAction,
  recordDisbursement,
  recordInternalReview,
  recordLenderDecision,
  requestInformation,
  respondToInformationRequest,
  submitToLender,
  withdrawApplication,
} from "@/server/services/workflow";
import {
  addCommissionAdjustment,
  approveCommission,
  createCommissionForDisbursement,
  getCommissionDetail,
  listCommissions,
  recordCommissionPayment,
} from "@/server/services/commissions";
import { changeApplicationAttribution } from "@/server/services/referrals";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/server/errors";
import { samplePdf } from "@/lib/domain/demo";
import type { Actor } from "@/server/rbac/actor";
import { actorFor, appRow, auditActions, createAgentActor, createCustomerActor, createUser, resetDatabase, submitDirectApplication, submitReferredApplication } from "./helpers";

let products: { HOME_LOAN: string; BUSINESS_LOAN: string };
let admin: Actor;
let superAdmin: Actor;
let officer: Actor;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  products = await resetDatabase();
  admin = await actorFor((await createUser("admin")).id);
  superAdmin = await actorFor((await createUser("super_admin")).id);
  officer = await actorFor((await createUser("loan_officer")).id);
});

async function verifyAll(appId: string) {
  const detail = await getApplicationDetail(officer, appId);
  for (const d of detail.documents) if (d.status === "PENDING_REVIEW") await reviewDocument(officer, d.id, { decision: "VERIFIED" });
}

/** Drives an application from SUBMITTED to APPROVED through every controlled step. */
async function toApproved(appId: string, approvedAmount = "4200000") {
  await assignApplication(admin, appId, { assigneeId: officer.userId });
  await verifyAll(appId);
  await completeDocumentation(officer, appId, { notes: "complete" });
  await recordInternalReview(admin, appId, { outcome: "RECOMMENDED", notes: "Meets criteria" });
  await submitToLender(admin, appId, { lenderName: "Test Lender" });
  await performSimpleAction(admin, appId, "lender_acknowledged", {});
  await recordLenderDecision(admin, appId, {
    decision: "APPROVED",
    lenderName: "Test Lender",
    approvedAmount,
    decisionDate: today,
    evidenceNote: "Sanction letter TL-123 dated today",
  });
}

describe("controlled workflow", () => {
  it("runs the information-request loop and requires complete verification before hand-off", async () => {
    const customer = await createCustomerActor();
    const { id, customer: owner } = await submitDirectApplication(customer, products.BUSINESS_LOAN);
    await assignApplication(admin, id, { assigneeId: officer.userId });
    // Cannot hand off with unverified documents.
    await expect(completeDocumentation(officer, id, {})).rejects.toBeInstanceOf(BusinessRuleError);

    const requestId = await requestInformation(officer, id, { message: "Please upload your latest GST certificate.", requestedCategories: ["BUSINESS_REGISTRATION"] });
    expect((await appRow(id)).status).toBe("INFORMATION_REQUIRED");
    // Customer may not perform staff actions.
    await expect(requestInformation(owner, id, { message: "self-serve request text" })).rejects.toBeInstanceOf(AuthorizationError);

    await uploadDocument(owner, { applicationId: id, category: "BUSINESS_REGISTRATION", filename: "gst.pdf", bytes: samplePdf("gst") });
    await respondToInformationRequest(owner, requestId, { responseText: "Uploaded the GST certificate." });
    expect((await appRow(id)).status).toBe("DOCUMENT_REVIEW");

    await verifyAll(id);
    // Responded-but-unresolved request still blocks the hand-off.
    await expect(completeDocumentation(officer, id, {})).rejects.toBeInstanceOf(BusinessRuleError);
    const { resolveInformationRequest } = await import("@/server/services/workflow");
    await resolveInformationRequest(officer, requestId);
    await completeDocumentation(officer, id, { notes: "All good" });
    const row = await appRow(id);
    expect(row.status).toBe("READY_FOR_ADMIN_REVIEW");
    // Documentation complete is NOT an approval and the officer cannot approve.
    await expect(recordInternalReview(officer, id, { outcome: "RECOMMENDED", notes: "trying to approve" })).rejects.toBeInstanceOf(NotFoundError);
    const assignment = await db.select().from(s.applicationAssignments).where(eq(s.applicationAssignments.applicationId, id));
    expect(assignment[0].status).toBe("COMPLETED");

    const history = await db.select().from(s.applicationStatusHistory).where(eq(s.applicationStatusHistory.applicationId, id));
    expect(history.map((h) => h.toStatus)).toEqual(
      expect.arrayContaining(["DRAFT", "SUBMITTED", "DOCUMENT_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_ADMIN_REVIEW"]),
    );
  });

  it("rejects invalid transitions and decisions without lender submission", async () => {
    const customer = await createCustomerActor();
    const { id, customer: owner } = await submitDirectApplication(customer, products.BUSINESS_LOAN);
    await expect(
      recordLenderDecision(admin, id, { decision: "APPROVED", lenderName: "X Bank", approvedAmount: "100000", decisionDate: today, evidenceNote: "letter number 1234" }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(recordDisbursement(admin, id, { amount: "1000", disbursedOn: today, lenderReference: "D-1", confirmationSource: "lender email confirmation" })).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(withdrawApplication(owner, id, "x")).rejects.toBeInstanceOf(ValidationError); // reason too short
    await withdrawApplication(owner, id, "Found another lender");
    expect((await appRow(id)).status).toBe("WITHDRAWN");
  });

  it("on hold resumes to the previous status", async () => {
    const customer = await createCustomerActor();
    const { id } = await submitDirectApplication(customer, products.BUSINESS_LOAN);
    await assignApplication(admin, id, { assigneeId: officer.userId });
    await performSimpleAction(admin, id, "put_on_hold", { reason: "Awaiting compliance check" });
    expect((await appRow(id)).status).toBe("ON_HOLD");
    await performSimpleAction(admin, id, "resume", {});
    expect((await appRow(id)).status).toBe("DOCUMENT_REVIEW");
  });
});

describe("commissions", () => {
  it("direct applications never generate a commission (service and database trigger)", async () => {
    const customer = await createCustomerActor();
    const { id } = await submitDirectApplication(customer, products.BUSINESS_LOAN, "business", "1500000");
    await toApproved(id, "1500000");
    const res = await recordDisbursement(admin, id, { amount: "1500000", disbursedOn: today, lenderReference: "DISB-D1", confirmationSource: "Lender disbursement advice" });
    expect(res.commissionId).toBeNull();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.commissionRecords).where(eq(s.commissionRecords.applicationId, id));
    expect(n).toBe(0);
    const [anyAgent] = await db.select().from(s.agents).limit(1);
    const agent = anyAgent ?? (await db.select().from(s.agents).limit(1))[0];
    if (agent) {
      await expect(
        db.insert(s.commissionRecords).values({
          applicationId: id,
          agentId: agent.id,
          baseAmount: "1",
          calculatedAmount: "1",
          payableAmount: "1",
          status: "PENDING_VERIFICATION",
          calculationDetails: {},
        }),
      ).rejects.toThrow();
    }
  });

  it("creates exactly one commission from the confirmed disbursed amount, then approves and pays it", async () => {
    const agent = await createAgentActor();
    const otherAgent = await createAgentActor();
    const { id } = await submitReferredApplication(agent, products.HOME_LOAN, "home_salaried", "4500000");
    await toApproved(id, "4200000");
    // Disbursement cannot exceed the approved amount.
    await expect(recordDisbursement(admin, id, { amount: "4300000", disbursedOn: today, lenderReference: "DISB-X", confirmationSource: "Lender disbursement advice" })).rejects.toBeInstanceOf(ValidationError);
    // An officer cannot record disbursements.
    await expect(recordDisbursement(officer, id, { amount: "4000000", disbursedOn: today, lenderReference: "DISB-O", confirmationSource: "Lender disbursement advice" })).rejects.toBeInstanceOf(NotFoundError);

    const res = await recordDisbursement(admin, id, { amount: "4000000", disbursedOn: today, lenderReference: "DISB-1", confirmationSource: "Lender disbursement advice" });
    expect(res.commissionStatus).toBe("PENDING_VERIFICATION");
    const [c] = await db.select().from(s.commissionRecords).where(eq(s.commissionRecords.applicationId, id));
    // Base = disbursed (4,000,000) not requested (4,500,000) or approved (4,200,000); slab 2 = 0.50%.
    expect(c.baseAmount).toBe("4000000.00");
    expect(c.calculatedAmount).toBe("20000.00");
    expect(c.agentId).toBe(agent.agentId);

    // Retries / duplicate events are idempotent.
    const again = await db.transaction((tx) => createCommissionForDisbursement(tx, { applicationId: id, disbursedAmount: "4000000", disbursedOn: today, actor: admin }));
    expect(again?.id).toBe(c.id);
    await expect(recordDisbursement(admin, id, { amount: "4000000", disbursedOn: today, lenderReference: "DISB-2", confirmationSource: "duplicate confirmation" })).rejects.toBeInstanceOf(BusinessRuleError);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.commissionRecords).where(eq(s.commissionRecords.applicationId, id));
    expect(n).toBe(1);

    // Attribution can no longer be silently changed once a commission exists.
    await expect(changeApplicationAttribution(superAdmin, id, { agentId: otherAgent.agentId, reason: "Dispute outcome" })).rejects.toBeInstanceOf(BusinessRuleError);

    // Agents cannot approve; payments require approval and the exact payable amount.
    const agentWithApprove = { ...agent, permissions: new Set([...agent.permissions, "commissions.approve"]) };
    await expect(approveCommission(agent, c.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(approveCommission(agentWithApprove, c.id)).rejects.toThrow(/own commission/);
    await expect(recordCommissionPayment(admin, c.id, { amount: "20000", paymentReference: "PAY-1", paymentMethod: "BANK_TRANSFER", paidOn: today })).rejects.toBeInstanceOf(BusinessRuleError);

    await addCommissionAdjustment(admin, c.id, { amount: "-500.50", reason: "Clawback of processing fee share" });
    let detail = await getCommissionDetail(admin, c.id);
    expect(detail.commission.payableAmount).toBe("19499.50");
    expect(detail.commission.status).toBe("PENDING_VERIFICATION");

    await approveCommission(admin, c.id);
    await expect(recordCommissionPayment(admin, c.id, { amount: "20000", paymentReference: "PAY-1", paymentMethod: "BANK_TRANSFER", paidOn: today })).rejects.toBeInstanceOf(ValidationError);
    await recordCommissionPayment(admin, c.id, { amount: "19499.50", paymentReference: "PAY-1", paymentMethod: "BANK_TRANSFER", paidOn: today });
    await expect(recordCommissionPayment(admin, c.id, { amount: "19499.50", paymentReference: "PAY-2", paymentMethod: "BANK_TRANSFER", paidOn: today })).rejects.toBeInstanceOf(BusinessRuleError);
    detail = await getCommissionDetail(admin, c.id);
    expect(detail.commission.status).toBe("PAID");
    expect(detail.payment?.paymentReference).toBe("PAY-1");

    // Agents see only their own commission records.
    expect((await listCommissions(agent, "own", {})).rows.map((r) => r.id)).toEqual([c.id]);
    expect((await listCommissions(otherAgent, "own", {})).rows).toHaveLength(0);
    await expect(getCommissionDetail(otherAgent, c.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listCommissions(agent, "all", {})).rejects.toBeInstanceOf(AuthorizationError);

    // Referral attribution survived every transition.
    expect((await appRow(id)).referringAgentId).toBe(agent.agentId);
    expect(await auditActions(c.id)).toEqual(expect.arrayContaining(["commission.calculated", "commission.adjusted", "commission.approved", "commission.paid"]));
  });

  it("marks commissions NOT_ELIGIBLE when no active rule matches", async () => {
    await db.update(s.commissionRules).set({ isActive: false });
    const agent = await createAgentActor();
    const { id } = await submitReferredApplication(agent, products.HOME_LOAN, "home_salaried", "1000000");
    await toApproved(id, "1000000");
    const res = await recordDisbursement(admin, id, { amount: "1000000", disbursedOn: today, lenderReference: "DISB-N", confirmationSource: "Lender disbursement advice" });
    expect(res.commissionStatus).toBe("NOT_ELIGIBLE");
    await db.update(s.commissionRules).set({ isActive: true });
  });
});

describe("audit trail", () => {
  it("is append-only at the database level", async () => {
    const blocked = (e: unknown) => /append-only/.test(String((e as { cause?: Error }).cause?.message ?? (e as Error).message));
    await expect(db.execute(sql`update audit_logs set action = 'tampered'`)).rejects.toSatisfy(blocked);
    await expect(db.execute(sql`delete from audit_logs`)).rejects.toSatisfy(blocked);
    await expect(db.execute(sql`delete from application_status_history`)).rejects.toSatisfy(blocked);
    await expect(db.execute(sql`update commission_payments set amount = 1`)).rejects.toSatisfy(blocked);
  });
});
