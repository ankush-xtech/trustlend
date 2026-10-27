import { z } from "zod";
import Decimal from "decimal.js";
import { extraFieldsFor, type ApplicantTypeValue, type ProductConfig } from "@/lib/domain/product-config";
import { BUSINESS_TYPES, EMPLOYMENT_TYPES, IDENTITY_DOCUMENT_TYPES, INDIAN_STATES, RELATIONSHIPS } from "@/lib/domain/labels";
import { ageOn, emailSchema, isoDateSchema, mobileSchema, moneySchema, personNameSchema, postalCodeSchema } from "./common";

/**
 * Wizard step schemas. They are built from the product configuration so the exact same rules run
 * in the browser (instant feedback) and on the server (authoritative validation).
 */

export const DECLARATION_VERSION = "2026-10-v1";

export interface ProductLimits {
  minAmount: string;
  maxAmount: string;
  config: ProductConfig;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

// ------------------------------------------------------------------ step 1

export function step1Schema(config: ProductConfig, today = new Date()) {
  return z
    .object({
      fullName: personNameSchema,
      dateOfBirth: isoDateSchema,
      mobile: mobileSchema,
      email: emailSchema,
      identityDocumentType: z.enum(IDENTITY_DOCUMENT_TYPES, { error: "Select an identity document type" }),
      identityNumberLast4: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{4}$/, "Enter only the last 4 characters"),
    })
    .superRefine((v, ctx) => {
      const d = new Date(`${v.dateOfBirth}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d > today) {
        ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Enter a valid date of birth" });
        return;
      }
      const age = ageOn(v.dateOfBirth, today);
      const { minApplicantAge, maxApplicantAge } = config.rules;
      if (age < minApplicantAge || age > maxApplicantAge) {
        ctx.addIssue({
          code: "custom",
          path: ["dateOfBirth"],
          message: `Applicants for this product must be between ${minApplicantAge} and ${maxApplicantAge} years old`,
        });
      }
    });
}
export type Step1Input = z.input<ReturnType<typeof step1Schema>>;
export type Step1Data = z.output<ReturnType<typeof step1Schema>>;

// ------------------------------------------------------------------ step 2

export const addressSchema = z.object({
  line1: z.string().trim().min(3, "Enter the address").max(200),
  line2: optionalText(200),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.enum(INDIAN_STATES, { error: "Select a state" }),
  postalCode: postalCodeSchema,
  country: z.literal("India").default("India"),
  yearsAtAddress: z.coerce.number().int().min(0, "Enter 0 or more").max(99).optional(),
});

export const referenceSchema = z.object({
  fullName: personNameSchema,
  relationship: z.enum(RELATIONSHIPS, { error: "Select the relationship" }),
  mobile: mobileSchema,
  city: optionalText(80),
});

export function step2Schema(config: ProductConfig) {
  return z
    .object({
      currentAddress: addressSchema,
      permanentSameAsCurrent: z.boolean(),
      permanentAddress: addressSchema.optional(),
      references: z.array(referenceSchema).length(config.referencesRequired, `Provide ${config.referencesRequired} references`),
      referenceConsent: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (config.requirePermanentAddress && !v.permanentSameAsCurrent && !v.permanentAddress) {
        ctx.addIssue({ code: "custom", path: ["permanentAddress", "line1"], message: "Enter the permanent address" });
      }
      if (config.referencesRequired > 0 && !v.referenceConsent) {
        ctx.addIssue({
          code: "custom",
          path: ["referenceConsent"],
          message: "Please confirm your references have agreed to be contacted",
        });
      }
      const mobiles = v.references.map((r) => r.mobile);
      if (new Set(mobiles).size !== mobiles.length) {
        ctx.addIssue({ code: "custom", path: ["references", 1, "mobile"], message: "Each reference needs a different mobile number" });
      }
    });
}
export type Step2Input = z.input<ReturnType<typeof step2Schema>>;
export type Step2Data = z.output<ReturnType<typeof step2Schema>>;

// ------------------------------------------------------------------ step 3

export const employmentSchema = z.object({
  employerName: z.string().trim().min(2, "Enter the employer name").max(120),
  jobTitle: z.string().trim().min(2, "Enter your job title").max(80),
  employmentType: z.enum(EMPLOYMENT_TYPES, { error: "Select the employment type" }),
  workExperienceMonths: z.coerce.number({ error: "Enter months of experience" }).int().min(0).max(720),
  monthlyIncome: moneySchema,
});

export const businessSchema = z.object({
  businessName: z.string().trim().min(2, "Enter the business name").max(160),
  businessType: z.enum(BUSINESS_TYPES, { error: "Select the business type" }),
  registrationNumber: optionalText(40),
  businessAddress: z.string().trim().min(5, "Enter the business address").max(300),
  yearsInOperation: z.coerce.number({ error: "Enter years in operation" }).int().min(0).max(150),
  annualTurnover: moneySchema,
  annualIncome: z
    .union([moneySchema, z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export function step3Schema(config: ProductConfig) {
  return z
    .object({
      applicantType: z.enum(config.applicantTypes as [ApplicantTypeValue, ...ApplicantTypeValue[]], {
        error: "Select how you earn your income",
      }),
      employment: employmentSchema.optional(),
      business: businessSchema.optional(),
    })
    .superRefine((v, ctx) => {
      if (v.applicantType === "SALARIED") {
        if (!v.employment) {
          ctx.addIssue({ code: "custom", path: ["employment", "employerName"], message: "Enter your employment details" });
          return;
        }
        const min = config.rules.minWorkExperienceMonths;
        if (min != null && v.employment.workExperienceMonths < min) {
          ctx.addIssue({
            code: "custom",
            path: ["employment", "workExperienceMonths"],
            message: `This product requires at least ${min} months of work experience`,
          });
        }
        if (new Decimal(v.employment.monthlyIncome).lte(0)) {
          ctx.addIssue({ code: "custom", path: ["employment", "monthlyIncome"], message: "Enter your monthly income" });
        }
      } else {
        if (!v.business) {
          ctx.addIssue({ code: "custom", path: ["business", "businessName"], message: "Enter your business details" });
          return;
        }
        const min = config.rules.minYearsInOperation;
        if (min != null && v.business.yearsInOperation < min) {
          ctx.addIssue({
            code: "custom",
            path: ["business", "yearsInOperation"],
            message: `This product requires at least ${min} years in operation`,
          });
        }
      }
    })
    .transform((v) => ({
      applicantType: v.applicantType,
      employment: v.applicantType === "SALARIED" ? v.employment : undefined,
      business: v.applicantType === "SALARIED" ? undefined : v.business,
    }));
}
export type Step3Input = z.input<ReturnType<typeof step3Schema>>;
export type Step3Data = z.output<ReturnType<typeof step3Schema>>;

// ------------------------------------------------------------------ step 4

export function step4Schema(limits: ProductLimits, applicantType: ApplicantTypeValue | null | undefined) {
  const fields = extraFieldsFor(limits.config, applicantType);
  const detailShape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    let s: z.ZodType;
    if (f.type === "select") {
      s = z.enum(f.options as [string, ...string[]], { error: `Select ${f.label.toLowerCase()}` });
    } else if (f.type === "number") {
      let n = z.coerce.number({ error: `Enter ${f.label.toLowerCase()}` });
      if (f.min != null) n = n.min(f.min, `Minimum is ${f.min}`);
      if (f.max != null) n = n.max(f.max, `Maximum is ${f.max}`);
      s = n;
    } else if (f.type === "money") {
      s = moneySchema;
    } else {
      s = z.string().trim().min(1, `Enter ${f.label.toLowerCase()}`).max(300);
    }
    detailShape[f.key] = f.required
      ? s
      : z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
  }

  return z
    .object({
      requestedAmount: moneySchema,
      requestedTenureMonths: z.coerce
        .number({ error: "Select a repayment tenure" })
        .int()
        .refine((v) => limits.config.tenureOptionsMonths.includes(v), "Select one of the available tenures"),
      loanPurpose: z.string().trim().min(10, "Describe the purpose in at least 10 characters").max(500),
      productDetails: z.object(detailShape).default({}),
    })
    .superRefine((v, ctx) => {
      const amount = new Decimal(v.requestedAmount);
      if (amount.lt(limits.minAmount) || amount.gt(limits.maxAmount)) {
        ctx.addIssue({
          code: "custom",
          path: ["requestedAmount"],
          message: `Enter an amount between ${formatPlain(limits.minAmount)} and ${formatPlain(limits.maxAmount)}`,
        });
      }
    });
}
export type Step4Input = z.input<ReturnType<typeof step4Schema>>;
export type Step4Data = z.output<ReturnType<typeof step4Schema>>;

function formatPlain(amount: string) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(amount));
}

// ------------------------------------------------------------------ submit

export const submitSchema = z.object({
  declarationAccepted: z.literal(true, { error: "Please accept the declaration to submit" }),
  expectedVersion: z.coerce.number().int().min(1),
});
