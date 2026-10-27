import { describe, expect, it } from "vitest";
import { step1Schema, step2Schema, step3Schema, step4Schema } from "@/lib/validation/application";
import { DEFAULT_PRODUCT_CONFIG, type ProductConfig } from "@/lib/domain/product-config";
import { emailSchema, mobileSchema, moneySchema, passwordSchema } from "@/lib/validation/common";

const config: ProductConfig = {
  ...DEFAULT_PRODUCT_CONFIG,
  applicantTypes: ["SALARIED", "BUSINESS"],
  tenureOptionsMonths: [12, 24, 36],
  rules: { minApplicantAge: 21, maxApplicantAge: 60, minWorkExperienceMonths: 12, minYearsInOperation: 2 },
  referencesRequired: 2,
  extraFields: [
    { key: "property_value", label: "Property value", type: "money", required: true },
    { key: "gst_registered", label: "GST registered", type: "select", required: true, options: ["Yes", "No"], applicantTypes: ["BUSINESS"] },
    { key: "notes", label: "Notes", type: "text", required: false },
  ],
};
const today = new Date("2026-10-26T00:00:00Z");

const person = { fullName: "Asha Verma", dateOfBirth: "1990-05-01", mobile: "+91 98765 43210", email: " Asha@Example.COM ", identityDocumentType: "PAN card", identityNumberLast4: "a1b2" };

describe("step 1 – personal information", () => {
  it("normalises valid input", () => {
    const r = step1Schema(config, today).parse(person);
    expect(r.mobile).toBe("9876543210");
    expect(r.email).toBe("asha@example.com");
    expect(r.identityNumberLast4).toBe("A1B2");
  });
  it("enforces product age limits", () => {
    expect(step1Schema(config, today).safeParse({ ...person, dateOfBirth: "2006-01-01" }).success).toBe(false); // 20
    expect(step1Schema(config, today).safeParse({ ...person, dateOfBirth: "1960-01-01" }).success).toBe(false); // 66
    expect(step1Schema(config, today).safeParse({ ...person, dateOfBirth: "2005-10-26" }).success).toBe(true); // exactly 21 today
    expect(step1Schema(config, today).safeParse({ ...person, dateOfBirth: "2005-10-27" }).success).toBe(false); // 21 tomorrow
  });
  it("rejects future dates, invalid names and full identity numbers", () => {
    expect(step1Schema(config, today).safeParse({ ...person, dateOfBirth: "2030-01-01" }).success).toBe(false);
    expect(step1Schema(config, today).safeParse({ ...person, fullName: "<script>" }).success).toBe(false);
    expect(step1Schema(config, today).safeParse({ ...person, identityNumberLast4: "ABCDE1234F" }).success).toBe(false);
  });
});

const address = { line1: "12 MG Road", city: "Pune", state: "Maharashtra", postalCode: "411001" };
const refs = [
  { fullName: "Ravi Kumar", relationship: "Sibling", mobile: "9000000001" },
  { fullName: "Meena Iyer", relationship: "Friend", mobile: "9000000002" },
];

describe("step 2 – address and references", () => {
  it("accepts same-as-current permanent address", () => {
    expect(step2Schema(config).safeParse({ currentAddress: address, permanentSameAsCurrent: true, references: refs, referenceConsent: true }).success).toBe(true);
  });
  it("requires a permanent address when different", () => {
    expect(step2Schema(config).safeParse({ currentAddress: address, permanentSameAsCurrent: false, references: refs, referenceConsent: true }).success).toBe(false);
  });
  it("requires exactly the configured number of references, distinct numbers and consent", () => {
    expect(step2Schema(config).safeParse({ currentAddress: address, permanentSameAsCurrent: true, references: [refs[0]], referenceConsent: true }).success).toBe(false);
    expect(step2Schema(config).safeParse({ currentAddress: address, permanentSameAsCurrent: true, references: [refs[0], refs[0]], referenceConsent: true }).success).toBe(false);
    expect(step2Schema(config).safeParse({ currentAddress: address, permanentSameAsCurrent: true, references: refs, referenceConsent: false }).success).toBe(false);
  });
  it("validates PIN codes", () => {
    expect(step2Schema(config).safeParse({ currentAddress: { ...address, postalCode: "011001" }, permanentSameAsCurrent: true, references: refs, referenceConsent: true }).success).toBe(false);
  });
});

describe("step 3 – conditional employment / business fields", () => {
  const employment = { employerName: "Acme", jobTitle: "Engineer", employmentType: "Permanent", workExperienceMonths: 24, monthlyIncome: "85,000" };
  const business = { businessName: "Acme Traders", businessType: "Partnership", businessAddress: "1 Market Rd, Pune", yearsInOperation: 5, annualTurnover: "5000000" };

  it("requires employment details for salaried applicants and drops irrelevant business fields", () => {
    const r = step3Schema(config).parse({ applicantType: "SALARIED", employment, business });
    expect(r.business).toBeUndefined();
    expect(r.employment?.monthlyIncome).toBe("85000");
    expect(step3Schema(config).safeParse({ applicantType: "SALARIED", business }).success).toBe(false);
  });
  it("requires business details for business applicants", () => {
    expect(step3Schema(config).safeParse({ applicantType: "BUSINESS", business }).success).toBe(true);
    expect(step3Schema(config).safeParse({ applicantType: "BUSINESS", employment }).success).toBe(false);
  });
  it("enforces product rules and allowed applicant types", () => {
    expect(step3Schema(config).safeParse({ applicantType: "SALARIED", employment: { ...employment, workExperienceMonths: 6 } }).success).toBe(false);
    expect(step3Schema(config).safeParse({ applicantType: "BUSINESS", business: { ...business, yearsInOperation: 1 } }).success).toBe(false);
    expect(step3Schema(config).safeParse({ applicantType: "SELF_EMPLOYED", business }).success).toBe(false);
  });
});

describe("step 4 – loan requirement and product-specific fields", () => {
  const limits = { minAmount: "500000.00", maxAmount: "5000000.00", config };
  const ok = { requestedAmount: "1500000", requestedTenureMonths: 24, loanPurpose: "Buying an apartment in Pune", productDetails: { property_value: "4000000" } };
  it("accepts valid input and enforces amount limits exactly", () => {
    expect(step4Schema(limits, "SALARIED").safeParse(ok).success).toBe(true);
    expect(step4Schema(limits, "SALARIED").safeParse({ ...ok, requestedAmount: "499999.99" }).success).toBe(false);
    expect(step4Schema(limits, "SALARIED").safeParse({ ...ok, requestedAmount: "500000" }).success).toBe(true);
    expect(step4Schema(limits, "SALARIED").safeParse({ ...ok, requestedAmount: "5000000.01" }).success).toBe(false);
  });
  it("restricts tenure to configured options", () => {
    expect(step4Schema(limits, "SALARIED").safeParse({ ...ok, requestedTenureMonths: 18 }).success).toBe(false);
  });
  it("applies conditional product fields per applicant type", () => {
    expect(step4Schema(limits, "SALARIED").safeParse({ ...ok, productDetails: {} }).success).toBe(false); // property_value required
    expect(step4Schema(limits, "BUSINESS").safeParse(ok).success).toBe(false); // gst_registered required for business
    expect(step4Schema(limits, "BUSINESS").safeParse({ ...ok, productDetails: { property_value: "1", gst_registered: "Maybe" } }).success).toBe(false);
    expect(step4Schema(limits, "BUSINESS").safeParse({ ...ok, productDetails: { property_value: "1", gst_registered: "Yes" } }).success).toBe(true);
  });
});

describe("shared field validators", () => {
  it("validates emails, Indian mobiles, passwords and money", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(mobileSchema.safeParse("5123456789").success).toBe(false);
    expect(mobileSchema.parse("0091-9876543210")).toBe("9876543210");
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterspassword").success).toBe(false);
    expect(passwordSchema.safeParse("long-enough-1").success).toBe(true);
    expect(moneySchema.safeParse("12.345").success).toBe(false);
    expect(moneySchema.parse("1,00,000.50")).toBe("100000.50");
    expect(moneySchema.safeParse("1e6").success).toBe(false);
  });
});
