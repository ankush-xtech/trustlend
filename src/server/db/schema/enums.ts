import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Postgres enums. Values are mirrored as TypeScript unions via `typeof enum.enumValues[number]`.
 * Adding a value requires a migration (ALTER TYPE ... ADD VALUE), which is intentional:
 * statuses drive business rules and must not be free-form strings.
 */

export const userStatus = pgEnum("user_status", ["INVITED", "ACTIVE", "DISABLED"]);

export const authTokenType = pgEnum("auth_token_type", [
  "PASSWORD_RESET",
  "EMAIL_VERIFICATION",
  "INVITATION",
]);

export const acquisitionSource = pgEnum("acquisition_source", ["DIRECT", "AGENT_REFERRAL"]);

export const agentStatus = pgEnum("agent_status", ["ACTIVE", "SUSPENDED"]);

export const referralStatus = pgEnum("referral_status", [
  "ACTIVE", // attribution in force
  "PENDING_REVIEW", // conflicting/duplicate referral awaiting an admin decision
  "REJECTED", // review rejected
  "SUPERSEDED", // replaced by another approved referral
  "REVOKED", // revoked by an authorized admin
]);

export const applicantType = pgEnum("applicant_type", ["SALARIED", "SELF_EMPLOYED", "BUSINESS"]);

export const applicationStatus = pgEnum("application_status", [
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
]);

export const addressType = pgEnum("address_type", ["CURRENT", "PERMANENT"]);

export const documentCategory = pgEnum("document_category", [
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
]);

export const documentStatus = pgEnum("document_status", [
  "PENDING_REVIEW",
  "VERIFIED",
  "REJECTED",
  "REPLACED",
  "REMOVED",
]);

export const scanStatus = pgEnum("scan_status", ["PENDING", "CLEAN", "INFECTED", "NOT_SCANNED", "ERROR"]);

export const assignmentStatus = pgEnum("assignment_status", ["ACTIVE", "COMPLETED", "REASSIGNED", "RELEASED"]);

export const assignmentStage = pgEnum("assignment_stage", ["DOCUMENT_REVIEW", "PROCESSING"]);

export const infoRequestStatus = pgEnum("info_request_status", ["OPEN", "RESPONDED", "RESOLVED", "CANCELLED"]);

export const taskStatus = pgEnum("task_status", ["OPEN", "DONE", "CANCELLED"]);

export const noteVisibility = pgEnum("note_visibility", ["INTERNAL", "CUSTOMER_VISIBLE"]);

export const internalReviewOutcome = pgEnum("internal_review_outcome", ["RECOMMENDED", "NOT_RECOMMENDED"]);

export const lenderDecisionType = pgEnum("lender_decision_type", ["APPROVED", "REJECTED"]);

export const commissionCalcType = pgEnum("commission_calc_type", ["PERCENTAGE", "FIXED", "SLAB"]);

export const commissionStatus = pgEnum("commission_status", [
  "NOT_ELIGIBLE",
  "PENDING_VERIFICATION",
  "APPROVED",
  "ADJUSTMENT_REQUIRED",
  "PAID",
  "CANCELLED",
]);

export const notificationStatus = pgEnum("notification_status", ["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"]);

export const notificationChannel = pgEnum("notification_channel", ["EMAIL", "IN_APP"]);

export type UserStatus = (typeof userStatus.enumValues)[number];
export type AuthTokenType = (typeof authTokenType.enumValues)[number];
export type AcquisitionSource = (typeof acquisitionSource.enumValues)[number];
export type ReferralStatus = (typeof referralStatus.enumValues)[number];
export type ApplicantType = (typeof applicantType.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
export type DocumentCategory = (typeof documentCategory.enumValues)[number];
export type DocumentStatus = (typeof documentStatus.enumValues)[number];
export type ScanStatus = (typeof scanStatus.enumValues)[number];
export type AssignmentStatus = (typeof assignmentStatus.enumValues)[number];
export type InfoRequestStatus = (typeof infoRequestStatus.enumValues)[number];
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type NoteVisibility = (typeof noteVisibility.enumValues)[number];
export type CommissionCalcType = (typeof commissionCalcType.enumValues)[number];
export type CommissionStatus = (typeof commissionStatus.enumValues)[number];
export type NotificationStatus = (typeof notificationStatus.enumValues)[number];
