import { z } from "zod";
import Decimal from "decimal.js";
import { APPLICANT_TYPES, EXTRA_FIELD_TYPES } from "@/lib/domain/product-config";
import { DOCUMENT_CATEGORIES } from "@/lib/domain/labels";
import { moneySchema } from "./common";

export const extraFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, "Use lowercase snake_case keys"),
    label: z.string().trim().min(2).max(80),
    type: z.enum(EXTRA_FIELD_TYPES),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    helpText: z.string().trim().max(200).optional(),
    applicantTypes: z.array(z.enum(APPLICANT_TYPES)).optional(),
  })
  .refine((f) => f.type !== "select" || (f.options && f.options.length > 0), { message: "Select fields need options", path: ["options"] });

export const productConfigSchema = z.object({
  applicantTypes: z.array(z.enum(APPLICANT_TYPES)).min(1, "Select at least one applicant type"),
  tenureOptionsMonths: z.array(z.number().int().min(1).max(480)).min(1, "Provide at least one tenure option"),
  rules: z
    .object({
      minApplicantAge: z.number().int().min(18).max(100),
      maxApplicantAge: z.number().int().min(18).max(100),
      minWorkExperienceMonths: z.number().int().min(0).max(600).nullable().optional(),
      minYearsInOperation: z.number().int().min(0).max(100).nullable().optional(),
    })
    .refine((r) => r.maxApplicantAge >= r.minApplicantAge, { message: "Maximum age must be at least the minimum age", path: ["maxApplicantAge"] }),
  requirePermanentAddress: z.boolean(),
  referencesRequired: z.number().int().min(0).max(3),
  extraFields: z.array(extraFieldSchema).max(20),
  eligibilityNotes: z.array(z.string().trim().min(1).max(300)).max(15),
});

export const productInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9_]{2,30}$/, "Use 3-30 uppercase letters, numbers or underscores"),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens"),
    name: z.string().trim().min(2).max(80),
    shortDescription: z.string().trim().max(200).default(""),
    description: z.string().trim().max(4000).default(""),
    referencePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use exactly two letters"),
    minAmount: moneySchema,
    maxAmount: moneySchema,
    isActive: z.boolean(),
    config: productConfigSchema,
  })
  .refine((p) => new Decimal(p.maxAmount).gt(p.minAmount), { message: "Maximum must be greater than minimum", path: ["maxAmount"] })
  .refine((p) => new Decimal(p.minAmount).gt(0), { message: "Minimum must be greater than zero", path: ["minAmount"] });

export const productDocumentSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  label: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  isRequired: z.boolean(),
  applicantTypes: z.array(z.enum(APPLICANT_TYPES)).nullable().optional(),
});

export const productDocumentsSchema = z
  .array(productDocumentSchema)
  .max(20)
  .refine((docs) => new Set(docs.map((d) => d.category)).size === docs.length, "Each document category can only appear once");
