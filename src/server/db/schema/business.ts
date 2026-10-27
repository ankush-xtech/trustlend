import { sql } from "drizzle-orm";
import {
  boolean,
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
} from "drizzle-orm/pg-core";
import type { ApplicantTypeValue, ProductConfig } from "../../../lib/domain/product-config";
import { agentStatus, documentCategory, referralStatus } from "./enums";
import { users } from "./identity";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/**
 * A customer is a person who applies (or is referred to apply) for a loan.
 * A customer may exist before they have a login (e.g. created by an agent referral);
 * `user_id` is linked once they claim an account with a verified email.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    mobile: text("mobile").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customers_user_unique").on(t.userId),
    uniqueIndex("customers_email_unique").on(sql`lower(${t.email})`),
    index("customers_mobile_idx").on(t.mobile),
    index("customers_name_idx").on(t.fullName),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Public, non-sequential agent code, e.g. AG-7K3P2Q. */
    agentCode: text("agent_code").notNull(),
    status: agentStatus("status").notNull().default("ACTIVE"),
    companyName: text("company_name"),
    city: text("city"),
    /** Masked payout reference only (e.g. bank account ending 1234). Full details are handled offline. */
    payoutReferenceMasked: text("payout_reference_masked"),
    notes: text("notes"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: ts("approved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agents_user_unique").on(t.userId), uniqueIndex("agents_code_unique").on(t.agentCode)],
);

/**
 * Referral attribution between an agent and a customer. Changes are explicit, reviewed and audited.
 * At most one ACTIVE referral per customer.
 */
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: referralStatus("status").notNull(),
    agentNotes: text("agent_notes"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    reviewNotes: text("review_notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("referrals_one_active_per_customer").on(t.customerId).where(sql`${t.status} = 'ACTIVE'`),
    uniqueIndex("referrals_no_duplicate_open")
      .on(t.agentId, t.customerId)
      .where(sql`${t.status} in ('ACTIVE','PENDING_REVIEW')`),
    index("referrals_agent_idx").on(t.agentId, t.status),
  ],
);

export const loanProducts = pgTable(
  "loan_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    /** Two-letter prefix used in application references, e.g. HL, BL. */
    referencePrefix: text("reference_prefix").notNull(),
    currency: text("currency").notNull().default("INR"),
    isActive: boolean("is_active").notNull().default(true),
    minAmount: money("min_amount").notNull(),
    maxAmount: money("max_amount").notNull(),
    config: jsonb("config").$type<ProductConfig>().notNull(),
    /** Seeded demo products are flagged so the UI can label them illustrative. */
    isIllustrative: boolean("is_illustrative").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("loan_products_code_unique").on(t.code), uniqueIndex("loan_products_slug_unique").on(t.slug)],
);

export const loanProductDocuments = pgTable(
  "loan_product_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => loanProducts.id, { onDelete: "cascade" }),
    category: documentCategory("category").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    isRequired: boolean("is_required").notNull().default(true),
    /** Restrict requirement to applicant types; null/empty = all applicants. */
    applicantTypes: jsonb("applicant_types").$type<ApplicantTypeValue[] | null>(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("loan_product_documents_unique").on(t.productId, t.category)],
);
