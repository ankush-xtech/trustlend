/**
 * DEVELOPMENT / TEST seed data. Everything created here is illustrative:
 *  - products and commission rules are flagged `is_illustrative` and labelled "Demo"
 *  - people are fictional and use the reserved @demo.trustlend.test domain (logins refused in production)
 *  - documents are generated sample PDFs containing no real data
 *
 *   npm run db:seed            (refuses to run when APP_ENV=production)
 *
 * Sample applications are created through the real application services, so the seed also
 * exercises the workflow, attribution and commission logic end to end.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { hashPassword, randomCode } from "@/server/auth/crypto";
import { loadActor } from "@/server/rbac/actor";
import { SYSTEM_ROLE_KEYS } from "@/server/rbac/catalog";
import { DEMO_EMAIL_DOMAIN } from "@/lib/domain/demo";
import { syncRbac } from "./lib/rbac-sync";
import { ensureDemoCommissionRules, ensureDemoProducts, fillDemoApplication } from "./lib/demo-catalog";
import { createDraftApplication, saveApplicationStep, submitApplication } from "@/server/services/applications";
import { reviewDocument } from "@/server/services/documents";
import { referCustomer } from "@/server/services/referrals";
import { assignApplication } from "@/server/services/assignments";
import {
  completeDocumentation,
  recordDisbursement,
  recordInternalReview,
  recordLenderDecision,
  requestInformation,
  submitToLender,
} from "@/server/services/workflow";
import { getApplicationDetail } from "@/server/services/applications";

const PASSWORD = process.env.SEED_DEMO_PASSWORD || "TrustLend-Demo-2026";
const email = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`;

async function ensureUser(local: string, name: string, roleKey: string, phone: string) {
  const addr = email(local);
  const [existing] = await db.select().from(s.users).where(eq(s.users.email, addr)).limit(1);
  if (existing) return existing.id;
  const [u] = await db
    .insert(s.users)
    .values({ email: addr, name, phone, passwordHash: await hashPassword(PASSWORD), status: "ACTIVE", emailVerifiedAt: new Date() })
    .returning({ id: s.users.id });
  const [role] = await db.select().from(s.roles).where(eq(s.roles.key, roleKey)).limit(1);
  await db.insert(s.userRoles).values({ userId: u.id, roleId: role.id });
  return u.id;
}

async function ensureAgent(userId: string, company: string, city: string) {
  const [existing] = await db.select().from(s.agents).where(eq(s.agents.userId, userId)).limit(1);
  if (existing) return existing.id;
  const [a] = await db
    .insert(s.agents)
    .values({ userId, agentCode: `AG-${randomCode(6)}`, companyName: company, city, payoutReferenceMasked: "XXXX0000 (demo)", approvedAt: new Date() })
    .returning({ id: s.agents.id });
  return a.id;
}

async function main() {
  if ((process.env.APP_ENV ?? "development") === "production") {
    console.error("Refusing to seed demo data when APP_ENV=production.");
    process.exit(1);
  }
  console.log("[seed] syncing roles and permissions…");
  await syncRbac(db);
  const productIds = await ensureDemoProducts();
  await ensureDemoCommissionRules(productIds);

  const [{ apps }] = await db.select({ apps: sql<number>`count(*)::int` }).from(s.loanApplications);
  const superAdminId = await ensureUser("superadmin", "Sam Superadmin Demo", SYSTEM_ROLE_KEYS.SUPER_ADMIN, "9800000001");
  const adminId = await ensureUser("admin", "Asha Admin Demo", SYSTEM_ROLE_KEYS.ADMIN, "9800000002");
  const officerId = await ensureUser("officer", "Omar Officer Demo", SYSTEM_ROLE_KEYS.LOAN_OFFICER, "9800000003");
  await ensureUser("officer2", "Olivia Officer Demo", SYSTEM_ROLE_KEYS.LOAN_OFFICER, "9800000004");
  const agentUserId = await ensureUser("agent", "Arjun Agent Demo", SYSTEM_ROLE_KEYS.AGENT, "9800000005");
  const agent2UserId = await ensureUser("agent2", "Anita Agent Demo", SYSTEM_ROLE_KEYS.AGENT, "9800000006");
  const customerUserId = await ensureUser("customer", "Chitra Customer Demo", SYSTEM_ROLE_KEYS.CUSTOMER, "9800000007");
  await ensureAgent(agentUserId, "Demo Advisory LLP", "Pune");
  await ensureAgent(agent2UserId, "Sample Finserv", "Mumbai");
  void superAdminId;

  if (apps > 0) {
    console.log("[seed] sample applications already exist; skipping workflow samples.");
    return;
  }

  const admin = (await loadActor(adminId))!;
  const officer = (await loadActor(officerId))!;
  let customer = (await loadActor(customerUserId))!;
  const agent = (await loadActor(agentUserId))!;
  const agent2 = (await loadActor(agent2UserId))!;

  console.log("[seed] creating sample applications through the services…");
  // 1. Direct customer: submitted business loan, then information requested.
  const direct = await createDraftApplication(customer, { productId: productIds.BUSINESS_LOAN });
  customer = (await loadActor(customerUserId))!;
  let v = await fillDemoApplication(customer, direct.id, { fullName: "Chitra Customer Demo", dob: "1988-04-12", mobile: "9800000007", email: email("customer") }, "business", "1500000");
  await submitApplication(customer, direct.id, { declarationAccepted: true, expectedVersion: v });
  await assignApplication(admin, direct.id, { assigneeId: officerId, stage: "DOCUMENT_REVIEW" });
  await requestInformation(officer, direct.id, {
    message: "Please upload the latest 2 years of financial statements signed by your accountant.",
    requestedCategories: ["FINANCIAL_STATEMENT"],
  });

  // 2. Direct customer: a draft (home loan) left at step 2.
  const draft = await createDraftApplication(customer, { productId: productIds.HOME_LOAN });
  await saveApplicationStep(customer, draft.id, 1, {
    expectedVersion: 1,
    data: { fullName: "Chitra Customer Demo", dateOfBirth: "1988-04-12", mobile: "9800000007", email: email("customer"), identityDocumentType: "PAN card", identityNumberLast4: "1234" },
  });

  // 3. Agent-referred customer: full lifecycle through disbursement and commission.
  const ref = await referCustomer(agent, { fullName: "Ravi Referred Demo", email: email("ravi"), mobile: "9811111111", consent: true });
  if (ref.status !== "CREATED") throw new Error("unexpected referral outcome");
  const referred = await createDraftApplication(agent, { productId: productIds.HOME_LOAN, customerId: ref.customerId });
  v = await fillDemoApplication(agent, referred.id, { fullName: "Ravi Referred Demo", dob: "1985-09-30", mobile: "9811111111", email: email("ravi") }, "home_salaried", "4500000");
  await submitApplication(agent, referred.id, { declarationAccepted: true, expectedVersion: v });
  await assignApplication(admin, referred.id, { assigneeId: officerId, stage: "DOCUMENT_REVIEW" });
  const detail = await getApplicationDetail(officer, referred.id);
  for (const d of detail.documents) await reviewDocument(officer, d.id, { decision: "VERIFIED", notes: "Checked against sample (demo)" });
  await completeDocumentation(officer, referred.id, { notes: "All documents verified (demo)" });
  await recordInternalReview(admin, referred.id, { outcome: "RECOMMENDED", notes: "Profile meets illustrative criteria (demo)." });
  await submitToLender(admin, referred.id, { lenderName: "Demo Lending Partner (illustrative)", lenderReference: "DEMO-LND-001" });
  const today = new Date().toISOString().slice(0, 10);
  await recordLenderDecision(admin, referred.id, {
    decision: "APPROVED",
    lenderName: "Demo Lending Partner (illustrative)",
    lenderReference: "DEMO-SANCTION-001",
    approvedAmount: "4200000",
    approvedTenureMonths: 240,
    decisionDate: today,
    evidenceNote: "Demo sanction letter reference DEMO-SANCTION-001 (illustrative)",
  });
  await recordDisbursement(admin, referred.id, {
    amount: "4200000",
    disbursedOn: today,
    lenderReference: "DEMO-DISB-001",
    confirmationSource: "Demo disbursement advice (illustrative) received by email",
  });

  // 4. Second agent: referred customer with a submitted business loan awaiting assignment.
  const ref2 = await referCustomer(agent2, { fullName: "Meera Referred Demo", email: email("meera"), mobile: "9822222222", consent: true });
  if (ref2.status === "CREATED") {
    const app2 = await createDraftApplication(agent2, { productId: productIds.BUSINESS_LOAN, customerId: ref2.customerId });
    v = await fillDemoApplication(agent2, app2.id, { fullName: "Meera Referred Demo", dob: "1990-01-15", mobile: "9822222222", email: email("meera") }, "business", "2500000");
    await submitApplication(agent2, app2.id, { declarationAccepted: true, expectedVersion: v });
  }
  console.log("[seed] done.");
}

main()
  .then(async () => {
    console.log(`\nDemo accounts (password: ${process.env.SEED_DEMO_PASSWORD ? "$SEED_DEMO_PASSWORD" : PASSWORD}):`);
    for (const l of ["superadmin", "admin", "officer", "officer2", "agent", "agent2", "customer"]) console.log(`  ${email(l)}`);
    await closeDb();
  })
  .catch(async (err) => {
    console.error("[seed] failed:", err);
    await closeDb();
    process.exit(1);
  });
