import { sql } from "drizzle-orm";
import {
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
} from "drizzle-orm/pg-core";
import { commissionCalcType, commissionStatus } from "./enums";
import { users } from "./identity";
import { agents, loanProducts } from "./business";
import { loanApplications } from "./applications";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/**
 * Slab definition. Boundaries: `minAmount` inclusive, `maxAmount` exclusive, `maxAmount: null` = unbounded.
 * The slab containing the commission base determines the rate/amount applied to the whole base.
 * Amounts are decimal strings to avoid floating point.
 */
export interface CommissionSlab {
  minAmount: string;
  maxAmount: string | null;
  ratePercent?: string | null;
  fixedAmount?: string | null;
}

export const commissionRules = pgTable(
  "commission_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** null = applies to all products. */
    productId: uuid("product_id").references(() => loanProducts.id, { onDelete: "restrict" }),
    /** null = applies to all agents; set for agent-specific terms. */
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "restrict" }),
    calcType: commissionCalcType("calc_type").notNull(),
    ratePercent: numeric("rate_percent", { precision: 7, scale: 4 }),
    fixedAmount: money("fixed_amount"),
    slabs: jsonb("slabs").$type<CommissionSlab[]>(),
    /** Eligibility: inclusive lower bound / exclusive upper bound on the commission base. */
    minBaseAmount: money("min_base_amount"),
    maxBaseAmount: money("max_base_amount"),
    capAmount: money("cap_amount"),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isIllustrative: boolean("is_illustrative").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("commission_rules_lookup_idx").on(t.isActive, t.productId, t.agentId),
    check(
      "commission_rules_calc_fields",
      sql`(${t.calcType} = 'PERCENTAGE' and ${t.ratePercent} is not null)
          or (${t.calcType} = 'FIXED' and ${t.fixedAmount} is not null)
          or (${t.calcType} = 'SLAB' and ${t.slabs} is not null)`,
    ),
    check("commission_rules_dates", sql`${t.effectiveTo} is null or ${t.effectiveTo} >= ${t.effectiveFrom}`),
  ],
);

export const commissionRecords = pgTable(
  "commission_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** One commission per application: the idempotency guarantee against duplicate creation. */
    applicationId: uuid("application_id")
      .notNull()
      .references(() => loanApplications.id, { onDelete: "restrict" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    ruleId: uuid("rule_id").references(() => commissionRules.id, { onDelete: "restrict" }),
    ruleSnapshot: jsonb("rule_snapshot").$type<Record<string, unknown> | null>(),
    baseAmount: money("base_amount").notNull(),
    calculatedAmount: money("calculated_amount").notNull(),
    /** calculated + sum(adjustments). This is the amount payable. */
    payableAmount: money("payable_amount").notNull(),
    status: commissionStatus("status").notNull(),
    calculationDetails: jsonb("calculation_details").$type<Record<string, unknown>>().notNull(),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: ts("approved_at"),
    cancelledById: uuid("cancelled_by_id").references(() => users.id, { onDelete: "set null" }),
    cancelledAt: ts("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    version: integer("version").notNull().default(1),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commission_records_application_unique").on(t.applicationId),
    index("commission_records_agent_idx").on(t.agentId, t.status),
    check("commission_records_amounts_non_negative", sql`${t.calculatedAmount} >= 0 and ${t.payableAmount} >= 0`),
  ],
);

/** Append-only adjustments (positive or negative) with reasons. */
export const commissionAdjustments = pgTable(
  "commission_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commissionId: uuid("commission_id")
      .notNull()
      .references(() => commissionRecords.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    reason: text("reason").notNull(),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("commission_adjustments_commission_idx").on(t.commissionId)],
);

/** Payment record. A commission is only PAID once a payment record with an external reference exists. */
export const commissionPayments = pgTable(
  "commission_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commissionId: uuid("commission_id")
      .notNull()
      .references(() => commissionRecords.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    paymentReference: text("payment_reference").notNull(),
    paymentMethod: text("payment_method").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    notes: text("notes"),
    recordedById: uuid("recorded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commission_payments_commission_unique").on(t.commissionId),
    uniqueIndex("commission_payments_reference_unique").on(t.paymentReference),
    check("commission_payments_amount_positive", sql`${t.amount} > 0`),
  ],
);
