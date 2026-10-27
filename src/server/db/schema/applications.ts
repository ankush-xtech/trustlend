import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  acquisitionSource,
  addressType,
  applicantType,
  applicationStatus,
  assignmentStage,
  assignmentStatus,
  documentCategory,
  documentStatus,
  infoRequestStatus,
  internalReviewOutcome,
  lenderDecisionType,
  noteVisibility,
  scanStatus,
  taskStatus,
} from "./enums";
import { users } from "./identity";
import { agents, customers, loanProducts, referrals } from "./business";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

export type ProductDetails = Record<string, string | number | null>;

export const loanApplications = pgTable(
  "loan_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-readable, random (non-sequential) reference, e.g. TL-HL-7K3P9QXM. */
    reference: text("reference").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => loanProducts.id, { onDelete: "restrict" }),
    status: applicationStatus("status").notNull().default("DRAFT"),
    applicantType: applicantType("applicant_type"),

    // --- Attribution (set by the server at creation; never from client input) ---
    acquisitionSource: acquisitionSource("acquisition_source").notNull(),
    referringAgentId: uuid("referring_agent_id").references(() => agents.id, { onDelete: "restrict" }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "restrict" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // --- Wizard progress ---
    currentStep: integer("current_step").notNull().default(1),
    completedSteps: jsonb("completed_steps").$type<number[]>().notNull().default([]),

    // --- Step 4: loan requirement (requested values, never approved values) ---
    requestedAmount: money("requested_amount"),
    requestedTenureMonths: integer("requested_tenure_months"),
    loanPurpose: text("loan_purpose"),
    productDetails: jsonb("product_details").$type<ProductDetails>().notNull().default({}),

    // --- Consent ---
    referenceConsentAt: ts("reference_consent_at"),
    declarationAcceptedAt: ts("declaration_accepted_at"),
    declarationVersion: text("declaration_version"),
    declarationAcceptedById: uuid("declaration_accepted_by_id").references(() => users.id, { onDelete: "set null" }),

    // --- Lifecycle ---
    /** Optimistic concurrency token; incremented on every update. */
    version: integer("version").notNull().default(1),
    submittedAt: ts("submitted_at"),
    submittedById: uuid("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    holdPreviousStatus: applicationStatus("hold_previous_status"),

    internalReviewOutcome: internalReviewOutcome("internal_review_outcome"),
    internalReviewNotes: text("internal_review_notes"),
    internalReviewedById: uuid("internal_reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    internalReviewedAt: ts("internal_reviewed_at"),

    lenderName: text("lender_name"),
    lenderReference: text("lender_reference"),
    submittedToLenderAt: ts("submitted_to_lender_at"),

    closedAt: ts("closed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("loan_applications_reference_unique").on(t.reference),
    index("loan_applications_customer_idx").on(t.customerId),
    index("loan_applications_status_idx").on(t.status),
    index("loan_applications_product_idx").on(t.productId),
    index("loan_applications_agent_idx").on(t.referringAgentId),
    index("loan_applications_created_idx").on(t.createdAt),
    check(
      "loan_applications_attribution_consistent",
      sql`(${t.acquisitionSource} = 'DIRECT' and ${t.referringAgentId} is null and ${t.referralId} is null)
          or (${t.acquisitionSource} = 'AGENT_REFERRAL' and ${t.referringAgentId} is not null)`,
    ),
    check("loan_applications_amount_positive", sql`${t.requestedAmount} is null or ${t.requestedAmount} > 0`),
  ],
);

/** Step 1: applicant personal details, captured per application so history stays auditable. */
export const applicationApplicants = pgTable("application_applicants", {
  applicationId: uuid("application_id")
    .primaryKey()
    .references(() => loanApplications.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  mobile: text("mobile").notNull(),
  email: text("email").notNull(),
  /** Type of identity document the applicant will provide (e.g. PAN, Passport). */
  identityDocumentType: text("identity_document_type"),
  /** Data minimisation: only the last 4 characters of an identity number are stored. */
  identityNumberLast4: text("identity_number_last4"),
  permanentSameAsCurrent: boolean("permanent_same_as_current").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const applicationAddresses = pgTable(
  "application_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "cascade" }),
    type: addressType("type").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("India"),
    yearsAtAddress: integer("years_at_address"),
  },
  (t) => [uniqueIndex("application_addresses_unique").on(t.applicationId, t.type)],
);

/** Personal references. These are references only, not guarantors or co-applicants. */
export const applicationReferences = pgTable(
  "application_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    fullName: text("full_name").notNull(),
    relationship: text("relationship").notNull(),
    mobile: text("mobile").notNull(),
    city: text("city"),
  },
  (t) => [uniqueIndex("application_references_unique").on(t.applicationId, t.position)],
);

export const applicationEmployment = pgTable("application_employment", {
  applicationId: uuid("application_id")
    .primaryKey()
    .references(() => loanApplications.id, { onDelete: "cascade" }),
  employerName: text("employer_name").notNull(),
  jobTitle: text("job_title").notNull(),
  employmentType: text("employment_type").notNull(),
  workExperienceMonths: integer("work_experience_months").notNull(),
  monthlyIncome: money("monthly_income").notNull(),
});

export const applicationBusiness = pgTable("application_business", {
  applicationId: uuid("application_id")
    .primaryKey()
    .references(() => loanApplications.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  businessType: text("business_type").notNull(),
  registrationNumber: text("registration_number"),
  businessAddress: text("business_address").notNull(),
  yearsInOperation: integer("years_in_operation").notNull(),
  annualTurnover: money("annual_turnover").notNull(),
  annualIncome: money("annual_income"),
});

export const applicationDocuments = pgTable(
  "application_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "restrict" }),
    category: documentCategory("category").notNull(),
    originalFilename: text("original_filename").notNull(),
    /** Opaque, server-generated key. Never derived from user input. */
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** MIME type detected from file signature on the server, not the browser-supplied type. */
    mimeType: text("mime_type").notNull(),
    sha256: text("sha256").notNull(),
    status: documentStatus("status").notNull().default("PENDING_REVIEW"),
    scanStatus: scanStatus("scan_status").notNull().default("PENDING"),
    scannedAt: ts("scanned_at"),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    uploadedAt: ts("uploaded_at").notNull().defaultNow(),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    replacesDocumentId: uuid("replaces_document_id").references((): AnyPgColumn => applicationDocuments.id, {
      onDelete: "restrict",
    }),
    infoRequestId: uuid("info_request_id"),
    removedAt: ts("removed_at"),
    removedById: uuid("removed_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("application_documents_storage_key_unique").on(t.storageKey),
    index("application_documents_app_idx").on(t.applicationId, t.status),
  ],
);

/** Append-only review history for documents. */
export const documentReviews = pgTable(
  "document_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => applicationDocuments.id, { onDelete: "restrict" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: documentStatus("decision").notNull(),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("document_reviews_document_idx").on(t.documentId)],
);

/** Append-only status transition history. */
export const applicationStatusHistory = pgTable(
  "application_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "restrict" }),
    fromStatus: applicationStatus("from_status"),
    toStatus: applicationStatus("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    /** Whether the entry is shown on the customer timeline. */
    customerVisible: boolean("customer_visible").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("application_status_history_app_idx").on(t.applicationId, t.createdAt)],
);

export const applicationAssignments = pgTable(
  "application_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "restrict" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignedById: uuid("assigned_by_id").references(() => users.id, { onDelete: "set null" }),
    stage: assignmentStage("stage").notNull().default("DOCUMENT_REVIEW"),
    status: assignmentStatus("status").notNull().default("ACTIVE"),
    notes: text("notes"),
    assignedAt: ts("assigned_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
  },
  (t) => [
    uniqueIndex("application_assignments_one_active")
      .on(t.applicationId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index("application_assignments_assignee_idx").on(t.assigneeId, t.status),
  ],
);

/** Requests for missing information or documents. `message` is customer-visible. */
export const informationRequests = pgTable(
  "information_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "restrict" }),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    message: text("message").notNull(),
    requestedCategories: jsonb("requested_categories").$type<string[]>().notNull().default([]),
    status: infoRequestStatus("status").notNull().default("OPEN"),
    responseText: text("response_text"),
    respondedById: uuid("responded_by_id").references(() => users.id, { onDelete: "set null" }),
    respondedAt: ts("responded_at"),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: ts("resolved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("information_requests_app_idx").on(t.applicationId, t.status)],
);

export const applicationTasks = pgTable(
  "application_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").references(() => loanApplications.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    dueAt: ts("due_at"),
    status: taskStatus("status").notNull().default("OPEN"),
    completedAt: ts("completed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("application_tasks_assignee_idx").on(t.assigneeId, t.status)],
);

export const applicationNotes = pgTable(
  "application_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "restrict" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    visibility: noteVisibility("visibility").notNull().default("INTERNAL"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("application_notes_app_idx").on(t.applicationId)],
);

/** Lender (bank/NBFC) decisions, recorded from external confirmation. Append-only. */
export const lenderDecisions = pgTable(
  "lender_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "restrict" }),
    decision: lenderDecisionType("decision").notNull(),
    lenderName: text("lender_name").notNull(),
    lenderReference: text("lender_reference"),
    approvedAmount: money("approved_amount"),
    approvedTenureMonths: integer("approved_tenure_months"),
    decisionDate: date("decision_date", { mode: "string" }).notNull(),
    evidenceNote: text("evidence_note").notNull(),
    recordedById: uuid("recorded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("lender_decisions_app_idx").on(t.applicationId),
    check(
      "lender_decisions_amount_consistent",
      sql`(${t.decision} = 'APPROVED' and ${t.approvedAmount} is not null and ${t.approvedAmount} > 0)
          or (${t.decision} = 'REJECTED' and ${t.approvedAmount} is null)`,
    ),
  ],
);

/** Confirmed disbursement. The commission base is `amount` (confirmed eligible disbursed principal). */
export const disbursements = pgTable(
  "disbursements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    disbursedOn: date("disbursed_on", { mode: "string" }).notNull(),
    lenderReference: text("lender_reference").notNull(),
    confirmationSource: text("confirmation_source").notNull(),
    recordedById: uuid("recorded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("disbursements_application_unique").on(t.applicationId),
    check("disbursements_amount_positive", sql`${t.amount} > 0`),
  ],
);
