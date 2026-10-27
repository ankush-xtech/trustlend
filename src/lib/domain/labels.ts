/**
 * Display labels and customer-friendly explanations for domain enums.
 * Shared by server and client. Keep in sync with the Postgres enums in src/server/db/schema/enums.ts.
 */

export const APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "DOCUMENT_REVIEW",
  "INFORMATION_REQUIRED",
  "READY_FOR_ADMIN_REVIEW",
  "UNDER_PROCESSING",
  "SUBMITTED_TO_LENDER",
  "LENDER_DECISION_PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "ON_HOLD",
  "DISBURSED",
  "CLOSED",
] as const;
export type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatusValue, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  DOCUMENT_REVIEW: "Document review",
  INFORMATION_REQUIRED: "Information required",
  READY_FOR_ADMIN_REVIEW: "Ready for admin review",
  UNDER_PROCESSING: "Under processing",
  SUBMITTED_TO_LENDER: "Submitted to lender",
  LENDER_DECISION_PENDING: "Lender decision pending",
  APPROVED: "Approved by lender",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  ON_HOLD: "On hold",
  DISBURSED: "Disbursed",
  CLOSED: "Closed",
};

/** Simple explanations for customers. Internal stages are summarised, never detailed. */
export const CUSTOMER_STATUS_EXPLANATIONS: Record<ApplicationStatusValue, { title: string; description: string }> = {
  DRAFT: { title: "Draft", description: "Your application is saved but not yet submitted. Continue where you left off." },
  SUBMITTED: { title: "Submitted", description: "We have received your application and will assign it to a reviewer shortly." },
  DOCUMENT_REVIEW: { title: "Reviewing documents", description: "Our team is checking the information and documents you provided." },
  INFORMATION_REQUIRED: { title: "Action needed", description: "We need some more information or documents from you. See the open requests below." },
  READY_FOR_ADMIN_REVIEW: { title: "In review", description: "Your documents are complete and your application is with our review team." },
  UNDER_PROCESSING: { title: "Processing", description: "Your application is being prepared for a lending partner." },
  SUBMITTED_TO_LENDER: { title: "With lender", description: "Your application has been shared with a lending partner for their assessment." },
  LENDER_DECISION_PENDING: { title: "Awaiting lender decision", description: "The lending partner is assessing your application." },
  APPROVED: { title: "Approved by lender", description: "The lending partner has approved your application. Disbursement depends on the lender's process." },
  REJECTED: { title: "Not approved", description: "Unfortunately this application was not approved." },
  WITHDRAWN: { title: "Withdrawn", description: "This application was withdrawn." },
  ON_HOLD: { title: "On hold", description: "Processing is temporarily paused. We will contact you if anything is needed." },
  DISBURSED: { title: "Disbursed", description: "The lender has confirmed disbursement of your loan." },
  CLOSED: { title: "Closed", description: "This application is closed." },
};

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export const STATUS_TONES: Record<ApplicationStatusValue, StatusTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  DOCUMENT_REVIEW: "info",
  INFORMATION_REQUIRED: "warning",
  READY_FOR_ADMIN_REVIEW: "info",
  UNDER_PROCESSING: "info",
  SUBMITTED_TO_LENDER: "info",
  LENDER_DECISION_PENDING: "info",
  APPROVED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  ON_HOLD: "warning",
  DISBURSED: "success",
  CLOSED: "neutral",
};

export const DOCUMENT_CATEGORIES = [
  "IDENTITY_PROOF",
  "ADDRESS_PROOF",
  "INCOME_PROOF",
  "BANK_STATEMENT",
  "EMPLOYMENT_DOCUMENT",
  "BUSINESS_REGISTRATION",
  "FINANCIAL_STATEMENT",
  "PROPERTY_DOCUMENT",
  "PHOTOGRAPH",
  "OTHER",
] as const;
export type DocumentCategoryValue = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategoryValue, string> = {
  IDENTITY_PROOF: "Identity proof",
  ADDRESS_PROOF: "Address proof",
  INCOME_PROOF: "Income proof",
  BANK_STATEMENT: "Bank statements",
  EMPLOYMENT_DOCUMENT: "Employment documents",
  BUSINESS_REGISTRATION: "Business registration",
  FINANCIAL_STATEMENT: "Financial statements",
  PROPERTY_DOCUMENT: "Property documents",
  PHOTOGRAPH: "Photograph",
  OTHER: "Other document",
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  REPLACED: "Replaced",
  REMOVED: "Removed",
};

export const SCAN_STATUS_LABELS: Record<string, string> = {
  PENDING: "Scan pending",
  CLEAN: "Scan clean",
  INFECTED: "Malware detected",
  NOT_SCANNED: "Not scanned",
  ERROR: "Scan error",
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  NOT_ELIGIBLE: "Not eligible",
  PENDING_VERIFICATION: "Pending verification",
  APPROVED: "Approved (payable)",
  ADJUSTMENT_REQUIRED: "Adjustment required",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const COMMISSION_STATUS_TONES: Record<string, StatusTone> = {
  NOT_ELIGIBLE: "neutral",
  PENDING_VERIFICATION: "warning",
  APPROVED: "info",
  ADJUSTMENT_REQUIRED: "warning",
  PAID: "success",
  CANCELLED: "neutral",
};

export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  PENDING_REVIEW: "Pending review",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
  REVOKED: "Revoked",
};

export const EMPLOYMENT_TYPES = ["Permanent", "Contract", "Probation", "Part-time"] as const;
export const BUSINESS_TYPES = [
  "Sole proprietorship",
  "Partnership",
  "LLP",
  "Private limited company",
  "Public limited company",
  "Professional practice",
  "Other",
] as const;
export const RELATIONSHIPS = ["Parent", "Sibling", "Spouse", "Relative", "Friend", "Colleague", "Neighbour", "Other"] as const;
export const IDENTITY_DOCUMENT_TYPES = ["PAN card", "Passport", "Voter ID", "Driving licence", "Aadhaar (masked)"] as const;

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;
