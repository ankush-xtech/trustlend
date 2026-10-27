/**
 * Loan product configuration shared by the server (validation) and the client (wizard rendering).
 * Stored as JSONB on `loan_products.config` so new products can be added without schema changes.
 */

export const APPLICANT_TYPES = ["SALARIED", "SELF_EMPLOYED", "BUSINESS"] as const;
export type ApplicantTypeValue = (typeof APPLICANT_TYPES)[number];

export const APPLICANT_TYPE_LABELS: Record<ApplicantTypeValue, string> = {
  SALARIED: "Salaried",
  SELF_EMPLOYED: "Self-employed professional",
  BUSINESS: "Business owner",
};

export const EXTRA_FIELD_TYPES = ["text", "number", "money", "select"] as const;
export type ExtraFieldType = (typeof EXTRA_FIELD_TYPES)[number];

export interface ExtraField {
  /** snake_case key; becomes the key in `loan_applications.product_details`. */
  key: string;
  label: string;
  type: ExtraFieldType;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  helpText?: string;
  /** Restrict the field to certain applicant types; omitted = all. */
  applicantTypes?: ApplicantTypeValue[];
}

export interface ProductRules {
  minApplicantAge: number;
  maxApplicantAge: number;
  /** Minimum months of work experience for salaried applicants (validation rule). */
  minWorkExperienceMonths?: number | null;
  /** Minimum years in operation for business / self-employed applicants (validation rule). */
  minYearsInOperation?: number | null;
}

export interface ProductConfig {
  applicantTypes: ApplicantTypeValue[];
  tenureOptionsMonths: number[];
  rules: ProductRules;
  /** Whether a permanent address must be captured (applicants can mark it the same as current). */
  requirePermanentAddress: boolean;
  /** Number of personal references required (0-3). */
  referencesRequired: number;
  extraFields: ExtraField[];
  /** Informational only. Never presented as an eligibility decision. */
  eligibilityNotes: string[];
}

export const DEFAULT_PRODUCT_CONFIG: ProductConfig = {
  applicantTypes: ["SALARIED", "SELF_EMPLOYED", "BUSINESS"],
  tenureOptionsMonths: [12, 24, 36, 60],
  rules: { minApplicantAge: 21, maxApplicantAge: 65, minWorkExperienceMonths: null, minYearsInOperation: null },
  requirePermanentAddress: true,
  referencesRequired: 2,
  extraFields: [],
  eligibilityNotes: [],
};

export function extraFieldsFor(config: ProductConfig, applicantType: ApplicantTypeValue | null | undefined) {
  return config.extraFields.filter(
    (f) => !f.applicantTypes || f.applicantTypes.length === 0 || (applicantType && f.applicantTypes.includes(applicantType)),
  );
}
