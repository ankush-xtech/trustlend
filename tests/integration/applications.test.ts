import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import {
  createDraftApplication,
  getApplicationDetail,
  getWizardState,
  listApplications,
  saveApplicationStep,
  submitApplication,
} from "@/server/services/applications";
import { referCustomer } from "@/server/services/referrals";
import { assignApplication } from "@/server/services/assignments";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { actorFor, appRow, auditActions, createAgentActor, createCustomerActor, createUser, resetDatabase, submitDirectApplication, submitReferredApplication } from "./helpers";

let products: { HOME_LOAN: string; BUSINESS_LOAN: string };

beforeAll(async () => {
  products = await resetDatabase();
});

describe("drafts and wizard persistence", () => {
  it("saves and resumes drafts with server-side validation and optimistic concurrency", async () => {
    const customer = await createCustomerActor();
    const draft = await createDraftApplication(customer, { productId: products.HOME_LOAN });
    const fresh = await actorFor(customer.userId);
    expect(draft.reference).toMatch(/^TL-HL-[0-9A-HJKMNP-TV-Z]{8}$/);

    // Server rejects invalid data even if the client is bypassed (age outside product limits).
    await expect(
      saveApplicationStep(fresh, draft.id, 1, {
        expectedVersion: 1,
        data: { fullName: "Asha Verma", dateOfBirth: "2015-01-01", mobile: "9876543210", email: "a@it.test", identityDocumentType: "PAN card", identityNumberLast4: "1234" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Steps must be completed in order.
    await expect(saveApplicationStep(fresh, draft.id, 3, { expectedVersion: 1, data: {} })).rejects.toBeInstanceOf(BusinessRuleError);

    const valid = { fullName: "Asha Verma", dateOfBirth: "1990-01-01", mobile: "9876543210", email: "a@it.test", identityDocumentType: "PAN card", identityNumberLast4: "1234" };
    const saved = await saveApplicationStep(fresh, draft.id, 1, { expectedVersion: 1, data: valid });
    expect(saved.version).toBe(2);
    // A stale writer gets a conflict instead of overwriting.
    await expect(saveApplicationStep(fresh, draft.id, 1, { expectedVersion: 1, data: valid })).rejects.toBeInstanceOf(ConflictError);

    const resumed = await getWizardState(fresh, draft.id);
    expect(resumed.application.completedSteps).toEqual([1]);
    expect(resumed.inputs.step1?.fullName).toBe("Asha Verma");
    expect(resumed.inputs.step1?.identityNumberLast4).toBe("1234");
  });

  it("does not allow another customer to read or edit the draft", async () => {
    const owner = await createCustomerActor();
    const draft = await createDraftApplication(owner, { productId: products.HOME_LOAN });
    const intruder = await createCustomerActor();
    await expect(getWizardState(intruder, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getApplicationDetail(intruder, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveApplicationStep(intruder, draft.id, 1, { expectedVersion: 1, data: {} })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses inactive products and enforces the open-application limit", async () => {
    const customer = await createCustomerActor();
    await db.update(s.loanProducts).set({ isActive: false }).where(eq(s.loanProducts.id, products.BUSINESS_LOAN));
    await expect(createDraftApplication(customer, { productId: products.BUSINESS_LOAN })).rejects.toBeInstanceOf(ValidationError);
    await db.update(s.loanProducts).set({ isActive: true }).where(eq(s.loanProducts.id, products.BUSINESS_LOAN));
    await createDraftApplication(customer, { productId: products.HOME_LOAN });
    await createDraftApplication(await actorFor(customer.userId), { productId: products.HOME_LOAN });
    await createDraftApplication(await actorFor(customer.userId), { productId: products.HOME_LOAN });
    await expect(createDraftApplication(await actorFor(customer.userId), { productId: products.HOME_LOAN })).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe("submission", () => {
  it("submits a complete direct application with DIRECT attribution, idempotently", async () => {
    const customer = await createCustomerActor();
    const { id, customer: fresh } = await submitDirectApplication(customer, products.BUSINESS_LOAN);
    const row = await appRow(id);
    expect(row.status).toBe("SUBMITTED");
    expect(row.acquisitionSource).toBe("DIRECT");
    expect(row.referringAgentId).toBeNull();
    // Double submit is a no-op that reports the existing submission.
    const again = await submitApplication(fresh, id, { declarationAccepted: true, expectedVersion: row.version });
    expect(again.alreadySubmitted).toBe(true);
    expect((await appRow(id)).version).toBe(row.version);
    // The customer can no longer edit.
    await expect(saveApplicationStep(fresh, id, 4, { expectedVersion: row.version, data: {} })).rejects.toBeInstanceOf(BusinessRuleError);
    expect(await auditActions(id)).toEqual(expect.arrayContaining(["application.created", "application.submitted"]));
    // Visible to the customer and to an admin.
    expect((await listApplications(fresh, "own", {})).rows.map((r) => r.id)).toContain(id);
    const admin = await actorFor((await createUser("admin")).id);
    expect((await getApplicationDetail(admin, id)).level).toBe("admin");
  });

  it("refuses submission when required documents are missing", async () => {
    const customer = await createCustomerActor();
    const draft = await createDraftApplication(customer, { productId: products.HOME_LOAN });
    const fresh = await actorFor(customer.userId);
    await expect(submitApplication(fresh, draft.id, { declarationAccepted: true, expectedVersion: 1 })).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(submitApplication(fresh, draft.id, { declarationAccepted: false, expectedVersion: 1 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("referral attribution", () => {
  it("records agent attribution set by the server and preserves it through assignment", async () => {
    const agent = await createAgentActor();
    const { id } = await submitReferredApplication(agent, products.HOME_LOAN);
    const row = await appRow(id);
    expect(row.acquisitionSource).toBe("AGENT_REFERRAL");
    expect(row.referringAgentId).toBe(agent.agentId);

    const admin = await actorFor((await createUser("admin")).id);
    const officer = await actorFor((await createUser("loan_officer")).id);
    await assignApplication(admin, id, { assigneeId: officer.userId });
    const after = await appRow(id);
    expect(after.status).toBe("DOCUMENT_REVIEW");
    expect(after.referringAgentId).toBe(agent.agentId); // assignment never changes attribution
  });

  it("agents cannot start applications for customers they did not refer", async () => {
    const agentA = await createAgentActor();
    const agentB = await createAgentActor();
    const ref = await referCustomer(agentA, { fullName: "Meera Iyer", email: "meera-x@it.test", mobile: "9811100001", consent: true });
    if (ref.status !== "CREATED") throw new Error("expected created");
    await expect(createDraftApplication(agentB, { productId: products.HOME_LOAN, customerId: ref.customerId })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("a duplicate referral of an existing customer goes to review instead of re-attributing", async () => {
    const agentA = await createAgentActor();
    const agentB = await createAgentActor();
    const first = await referCustomer(agentA, { fullName: "Dup Person", email: "dup@it.test", mobile: "9811100002", consent: true });
    expect(first.status).toBe("CREATED");
    const second = await referCustomer(agentB, { fullName: "Dup Person", email: "DUP@it.test", mobile: "9811100003", consent: true });
    expect(second.status).toBe("SUBMITTED_FOR_REVIEW");
    const again = await referCustomer(agentA, { fullName: "Dup Person", email: "dup@it.test", mobile: "9811100002", consent: true });
    expect(again.status).toBe("ALREADY_REFERRED_BY_YOU");
    const refs = await db.select().from(s.referrals).where(eq(s.referrals.agentId, agentB.agentId!));
    expect(refs[0].status).toBe("PENDING_REVIEW");
  });

  it("a referred customer who self-starts an application is attributed to the active referring agent", async () => {
    const agent = await createAgentActor();
    const customerUser = await createUser("customer");
    const ref = await referCustomer(agent, { fullName: "Self Starter", email: customerUser.email, mobile: "9811100004", consent: true });
    expect(ref.status).toBe("CREATED");
    const customer = await actorFor(customerUser.id);
    const draft = await createDraftApplication(customer, { productId: products.HOME_LOAN });
    const row = await appRow(draft.id);
    expect(row.acquisitionSource).toBe("AGENT_REFERRAL");
    expect(row.referringAgentId).toBe(agent.agentId);
  });
});

describe("record-level access", () => {
  it("loan officers only see actively assigned applications", async () => {
    const customer = await createCustomerActor();
    const { id } = await submitDirectApplication(customer, products.BUSINESS_LOAN);
    const officer = await actorFor((await createUser("loan_officer")).id);
    const other = await actorFor((await createUser("loan_officer")).id);
    await expect(getApplicationDetail(officer, id)).rejects.toBeInstanceOf(NotFoundError);
    const admin = await actorFor((await createUser("admin")).id);
    await assignApplication(admin, id, { assigneeId: officer.userId });
    expect((await getApplicationDetail(officer, id)).level).toBe("staff");
    await expect(getApplicationDetail(other, id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listApplications(officer, "assigned", {})).rows.map((r) => r.id)).toEqual([id]);
    // Reassignment removes the previous officer's access.
    await assignApplication(admin, id, { assigneeId: other.userId });
    await expect(getApplicationDetail(officer, id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("customers and agents never receive internal notes or other parties' data", async () => {
    const agent = await createAgentActor();
    const otherAgent = await createAgentActor();
    const { id } = await submitReferredApplication(agent, products.HOME_LOAN);
    const agentView = await getApplicationDetail(agent, id);
    expect(agentView.level).toBe("agent");
    expect(agentView.references).toEqual([]);
    expect(agentView.assignments).toEqual([]);
    await expect(getApplicationDetail(otherAgent, id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listApplications(otherAgent, "referred", {})).rows).toHaveLength(0);
  });
});
