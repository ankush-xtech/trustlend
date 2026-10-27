/**
 * Illustrative demo catalog shared by the seed script and the integration/E2E tests.
 * Everything here is clearly marked as demo data; rates are NOT real lender or partner rates.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { DEFAULT_PRODUCT_CONFIG, type ProductConfig } from "@/lib/domain/product-config";
import { samplePdf } from "@/lib/domain/demo";
import { saveApplicationStep, completeDocumentsStep } from "@/server/services/applications";
import { uploadDocument } from "@/server/services/documents";


const homeConfig: ProductConfig = {
  ...DEFAULT_PRODUCT_CONFIG,
  applicantTypes: ["SALARIED", "SELF_EMPLOYED", "BUSINESS"],
  tenureOptionsMonths: [60, 120, 180, 240, 300],
  rules: { minApplicantAge: 21, maxApplicantAge: 65, minWorkExperienceMonths: 12, minYearsInOperation: 2 },
  requirePermanentAddress: true,
  referencesRequired: 2,
  extraFields: [
    { key: "property_type", label: "Property type", type: "select", required: true, options: ["Ready to move", "Under construction", "Plot + construction", "Resale"] },
    { key: "property_city", label: "Property city", type: "text", required: true },
    { key: "property_value", label: "Estimated property value", type: "money", required: true, helpText: "Your own estimate; the lender performs its own valuation." },
    { key: "loan_type", label: "Loan type", type: "select", required: true, options: ["New purchase", "Balance transfer", "Home improvement"] },
  ],
  eligibilityNotes: [
    "Illustrative criteria only. Final eligibility is decided by the lending partner.",
    "Applicants are typically between 21 and 65 years of age.",
    "Salaried applicants usually need at least 12 months of work experience.",
  ],
};

const businessConfig: ProductConfig = {
  ...DEFAULT_PRODUCT_CONFIG,
  applicantTypes: ["SELF_EMPLOYED", "BUSINESS"],
  tenureOptionsMonths: [12, 24, 36, 48, 60],
  rules: { minApplicantAge: 23, maxApplicantAge: 65, minWorkExperienceMonths: null, minYearsInOperation: 2 },
  requirePermanentAddress: true,
  referencesRequired: 2,
  extraFields: [
    { key: "gst_registered", label: "GST registered", type: "select", required: true, options: ["Yes", "No"] },
    { key: "existing_monthly_emis", label: "Existing monthly EMIs", type: "money", required: false, helpText: "Total of current loan EMIs, if any." },
    { key: "collateral_offered", label: "Collateral offered", type: "select", required: true, options: ["None", "Property", "Machinery", "Other"] },
  ],
  eligibilityNotes: [
    "Illustrative criteria only. Final eligibility is decided by the lending partner.",
    "Businesses are typically expected to have operated for at least 2 years.",
  ],
};

export async function ensureDemoProducts() {
  const products = [
    {
      code: "HOME_LOAN",
      slug: "home-loan",
      name: "Home Loan",
      referencePrefix: "HL",
      shortDescription: "Finance the purchase, construction or improvement of a home.",
      description:
        "Apply for a home loan to buy a ready or under-construction home, construct on a plot, transfer an existing loan or renovate. TrustLend helps you prepare and submit your application to a lending partner. Displaying this product does not guarantee eligibility or approval; rates and terms are set by the lender.",
      minAmount: "500000.00",
      maxAmount: "50000000.00",
      config: homeConfig,
      sortOrder: 1,
      docs: [
        { category: "IDENTITY_PROOF", label: "Identity proof", description: "PAN card, passport, voter ID or driving licence.", isRequired: true },
        { category: "ADDRESS_PROOF", label: "Address proof", description: "Utility bill, passport or rental agreement.", isRequired: true },
        { category: "INCOME_PROOF", label: "Income proof", description: "Last 3 salary slips or last 2 years' ITR.", isRequired: true },
        { category: "BANK_STATEMENT", label: "Bank statements", description: "Last 6 months of your primary account.", isRequired: true },
        { category: "PROPERTY_DOCUMENT", label: "Property documents", description: "Sale agreement, allotment letter or title documents.", isRequired: true },
        { category: "EMPLOYMENT_DOCUMENT", label: "Employment proof", description: "Offer letter or employment certificate.", isRequired: false, applicantTypes: ["SALARIED"] },
        { category: "BUSINESS_REGISTRATION", label: "Business registration", description: "GST certificate, Udyam registration or partnership deed.", isRequired: true, applicantTypes: ["SELF_EMPLOYED", "BUSINESS"] },
      ],
    },
    {
      code: "BUSINESS_LOAN",
      slug: "business-loan",
      name: "Business Loan",
      referencePrefix: "BL",
      shortDescription: "Working capital and growth finance for businesses and professionals.",
      description:
        "Apply for an unsecured or secured business loan for working capital, expansion, equipment or inventory. TrustLend helps you prepare and submit your application to a lending partner. Displaying this product does not guarantee eligibility or approval; rates and terms are set by the lender.",
      minAmount: "100000.00",
      maxAmount: "10000000.00",
      config: businessConfig,
      sortOrder: 2,
      docs: [
        { category: "IDENTITY_PROOF", label: "Identity proof", description: "PAN card, passport, voter ID or driving licence of the applicant.", isRequired: true },
        { category: "ADDRESS_PROOF", label: "Address proof", description: "Proof of residential address.", isRequired: true },
        { category: "BANK_STATEMENT", label: "Business bank statements", description: "Last 12 months of the business current account.", isRequired: true },
        { category: "BUSINESS_REGISTRATION", label: "Business registration", description: "GST certificate, Udyam registration, incorporation certificate or partnership deed.", isRequired: true },
        { category: "FINANCIAL_STATEMENT", label: "Financial statements", description: "Last 2 years' ITR with computation, P&L and balance sheet.", isRequired: true },
      ],
    },
  ] as const;
  const ids: Record<string, string> = {};
  for (const p of products) {
    const [existing] = await db.select().from(s.loanProducts).where(eq(s.loanProducts.code, p.code)).limit(1);
    if (existing) {
      ids[p.code] = existing.id;
      continue;
    }
    const { docs, ...values } = p;
    const [created] = await db
      .insert(s.loanProducts)
      .values({ ...values, config: values.config, isActive: true, isIllustrative: true })
      .returning({ id: s.loanProducts.id });
    ids[p.code] = created.id;
    await db.insert(s.loanProductDocuments).values(
      docs.map((d, i) => ({
        productId: created.id,
        category: d.category,
        label: d.label,
        description: d.description,
        isRequired: d.isRequired,
        applicantTypes: "applicantTypes" in d ? [...d.applicantTypes] : null,
        sortOrder: i,
      })),
    );
  }
  return ids;
}

export async function ensureDemoCommissionRules(productIds: Record<string, string>) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.commissionRules);
  if (n > 0) return;
  await db.insert(s.commissionRules).values([
    {
      name: "Demo — Home loan slabs (illustrative)",
      description: "ILLUSTRATIVE demo rates for development only. Not real lender or partner rates.",
      productId: productIds.HOME_LOAN,
      calcType: "SLAB",
      slabs: [
        { minAmount: "0", maxAmount: "2500000", ratePercent: "0.35" },
        { minAmount: "2500000", maxAmount: "10000000", ratePercent: "0.50" },
        { minAmount: "10000000", maxAmount: null, ratePercent: "0.60" },
      ],
      capAmount: "100000.00",
      effectiveFrom: "2025-01-01",
      priority: 10,
      isIllustrative: true,
    },
    {
      name: "Demo — Business loan percentage (illustrative)",
      description: "ILLUSTRATIVE demo rate for development only.",
      productId: productIds.BUSINESS_LOAN,
      calcType: "PERCENTAGE",
      ratePercent: "1.0000",
      capAmount: "75000.00",
      effectiveFrom: "2025-01-01",
      priority: 10,
      isIllustrative: true,
    },
    {
      name: "Demo — Generic fixed fallback (illustrative)",
      description: "ILLUSTRATIVE fallback for products without a specific rule.",
      calcType: "FIXED",
      fixedAmount: "2500.00",
      effectiveFrom: "2025-01-01",
      priority: 0,
      isIllustrative: true,
    },
  ]);
}

export const demoAddress = (city: string, state: string, postalCode: string) => ({
  line1: `12 Sample Street (demo)`,
  line2: "",
  city,
  state,
  postalCode,
  country: "India",
  yearsAtAddress: 4,
});

export async function fillDemoApplication(
  actor: Actor,
  appId: string,
  person: { fullName: string; dob: string; mobile: string; email: string },
  kind: "home_salaried" | "business",
  amount: string,
) {
  let version = 1;
  version = (
    await saveApplicationStep(actor, appId, 1, {
      expectedVersion: version,
      data: { ...person, dateOfBirth: person.dob, identityDocumentType: "PAN card", identityNumberLast4: "1234" },
    })
  ).version;
  version = (
    await saveApplicationStep(actor, appId, 2, {
      expectedVersion: version,
      data: {
        currentAddress: demoAddress("Pune", "Maharashtra", "411001"),
        permanentSameAsCurrent: true,
        references: [
          { fullName: "Reference One Demo", relationship: "Sibling", mobile: "9000000001", city: "Pune" },
          { fullName: "Reference Two Demo", relationship: "Friend", mobile: "9000000002", city: "Mumbai" },
        ],
        referenceConsent: true,
      },
    })
  ).version;
  version = (
    await saveApplicationStep(actor, appId, 3, {
      expectedVersion: version,
      data:
        kind === "home_salaried"
          ? {
              applicantType: "SALARIED",
              employment: { employerName: "Demo Technologies Pvt Ltd", jobTitle: "Engineer", employmentType: "Permanent", workExperienceMonths: 60, monthlyIncome: "150000" },
            }
          : {
              applicantType: "BUSINESS",
              business: {
                businessName: "Demo Traders",
                businessType: "Sole proprietorship",
                registrationNumber: "DEMO-REG-001",
                businessAddress: "45 Market Road (demo), Pune",
                yearsInOperation: 6,
                annualTurnover: "8000000",
                annualIncome: "1200000",
              },
            },
    })
  ).version;
  version = (
    await saveApplicationStep(actor, appId, 4, {
      expectedVersion: version,
      data: {
        requestedAmount: amount,
        requestedTenureMonths: kind === "home_salaried" ? 240 : 36,
        loanPurpose: kind === "home_salaried" ? "Purchase of a ready-to-move apartment (demo)" : "Working capital for inventory expansion (demo)",
        productDetails:
          kind === "home_salaried"
            ? { property_type: "Ready to move", property_city: "Pune", property_value: "6500000", loan_type: "New purchase" }
            : { gst_registered: "Yes", existing_monthly_emis: "15000", collateral_offered: "None" },
      },
    })
  ).version;
  const categories =
    kind === "home_salaried"
      ? ["IDENTITY_PROOF", "ADDRESS_PROOF", "INCOME_PROOF", "BANK_STATEMENT", "PROPERTY_DOCUMENT"]
      : ["IDENTITY_PROOF", "ADDRESS_PROOF", "BANK_STATEMENT", "BUSINESS_REGISTRATION", "FINANCIAL_STATEMENT"];
  for (const c of categories) {
    await uploadDocument(actor, { applicationId: appId, category: c, filename: `${c.toLowerCase()}-sample.pdf`, bytes: samplePdf(c) });
  }
  const [row] = await db.select({ version: s.loanApplications.version }).from(s.loanApplications).where(eq(s.loanApplications.id, appId));
  version = (await completeDocumentsStep(actor, appId, { expectedVersion: row.version })).version;
  return version;
}

