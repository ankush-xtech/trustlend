import { z } from "zod";

/** Shared field schemas used by both client forms and server services. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(64, "Use at most 64 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

/** Indian mobile numbers (10 digits starting 6-9), optional +91 prefix. Normalized to 10 digits. */
export const mobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|0091|91)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"));

export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Enter the full name")
  .max(120, "Name is too long")
  .regex(/^[\p{L}][\p{L}\s.'-]*$/u, "Use letters, spaces, apostrophes, dots or hyphens");

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code");

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/** Decimal money amount as a string with up to 2 decimals; never parsed as a float for arithmetic. */
export const moneySchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a valid amount"));

export const uuidSchema = z.uuid("Invalid identifier");

export const reasonSchema = z.string().trim().min(3, "Please provide a reason").max(1000, "Reason is too long");

export function ageOn(dateOfBirth: string, today = new Date()): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}
