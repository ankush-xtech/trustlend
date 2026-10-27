import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db/client";
import { authTokens, roles, userRoles, users, type AuthTokenType } from "@/server/db/schema";
import { env } from "@/server/config/env";
import { generateToken, hashPassword, sha256Hex, verifyAgainstDummy, verifyPassword } from "@/server/auth/crypto";
import { createSession, invalidateUserSessions } from "@/server/auth/session";
import { consumeRateLimit, RATE_LIMITS, resetRateLimit } from "@/server/rate-limit";
import { AuthenticationError, BusinessRuleError, ValidationError } from "@/server/errors";
import { emailSchema, mobileSchema, passwordSchema, personNameSchema } from "@/lib/validation/common";
import { templates } from "@/server/email/templates";
import { appUrl, enqueueEmail, scheduleDispatch } from "./notifications";
import { recordAudit } from "./audit";
import { SYSTEM_ROLE_KEYS } from "@/server/rbac/catalog";
import { isDemoEmail } from "@/lib/domain/demo";
import { getRequestMeta } from "@/server/request-context";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";

const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  PASSWORD_RESET: 30 * 60 * 1000,
  EMAIL_VERIFICATION: 24 * 3600 * 1000,
  INVITATION: 72 * 3600 * 1000,
};

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

// ------------------------------------------------------------------ tokens

/** Issues a single-use token. Previous unused tokens of the same type for the user are revoked. */
export async function issueAuthToken(tx: DbOrTx, userId: string, type: AuthTokenType) {
  await tx
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
  const token = generateToken();
  await tx.insert(authTokens).values({
    userId,
    type,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
  });
  return token;
}

/** Atomically consumes a token (single use). Returns the user id or null if invalid/expired/used. */
async function consumeAuthToken(tx: DbOrTx, token: string, type: AuthTokenType): Promise<string | null> {
  if (!token || token.length > 100) return null;
  const [row] = await tx
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, sha256Hex(token)),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: authTokens.userId });
  return row?.userId ?? null;
}

/** Non-consuming check used to render the reset/invite pages. */
export async function isAuthTokenValid(token: string, type: AuthTokenType) {
  if (!token || token.length > 100) return false;
  const [row] = await db
    .select({ id: authTokens.id })
    .from(authTokens)
    .where(
      and(eq(authTokens.tokenHash, sha256Hex(token)), eq(authTokens.type, type), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())),
    )
    .limit(1);
  return !!row;
}

async function findUserByEmail(conn: DbOrTx, email: string) {
  const [user] = await conn
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return user ?? null;
}

// ------------------------------------------------------------------ registration

export const registerSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  mobile: mobileSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: "You must accept the terms and privacy notice" }),
});

/**
 * Public customer registration. Always returns the same outcome to avoid account enumeration;
 * if the email is taken, the existing owner receives an informational email instead.
 * Public registration can only ever create a Customer account.
 */
export async function registerCustomer(input: unknown) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  const meta = await getRequestMeta();
  await consumeRateLimit(RATE_LIMITS.register, meta.ipAddress);

  const passwordHash = await hashPassword(data.password);

  await db.transaction(async (tx) => {
    const existing = await findUserByEmail(tx, data.email);
    if (existing) {
      await enqueueEmail(tx, {
        to: existing.email,
        userId: existing.id,
        template: "account_exists",
        email: templates.accountExists({ url: appUrl("/login") }),
        dedupeKey: `account-exists:${existing.id}:${new Date().toISOString().slice(0, 13)}`,
      });
      return;
    }
    const [user] = await tx
      .insert(users)
      .values({
        email: data.email,
        name: data.name,
        phone: data.mobile,
        passwordHash,
        status: "ACTIVE",
      })
      .returning({ id: users.id });
    const [customerRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, SYSTEM_ROLE_KEYS.CUSTOMER)).limit(1);
    if (!customerRole) throw new Error("Customer role is not provisioned. Run the seed script.");
    await tx.insert(userRoles).values({ userId: user.id, roleId: customerRole.id });

    const token = await issueAuthToken(tx, user.id, "EMAIL_VERIFICATION");
    await enqueueEmail(tx, {
      to: data.email,
      userId: user.id,
      template: "email_verification",
      email: templates.emailVerification({ name: data.name, url: appUrl(`/verify-email?token=${token}`) }),
      containsSecret: true,
    });
    await recordAudit(tx, {
      actor: { userId: user.id, email: data.email },
      action: "auth.register",
      entityType: "user",
      entityId: user.id,
      after: { role: SYSTEM_ROLE_KEYS.CUSTOMER },
    });
  });
  scheduleDispatch();
}

// ------------------------------------------------------------------ login / logout

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

export type LoginResult = { ok: true; token: string; expiresAt: Date; userId: string } | { ok: false; reason: "unverified"; message: string };

export async function login(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const { email, password } = parsed.data;
  const meta = await getRequestMeta();
  await consumeRateLimit(RATE_LIMITS.loginByIp, meta.ipAddress);
  await consumeRateLimit(RATE_LIMITS.loginByIdentifier, email);

  const user = await findUserByEmail(db, email);
  if (!user || !user.passwordHash || (env().APP_ENV === "production" && isDemoEmail(email))) {
    await verifyAgainstDummy(password);
    throw new AuthenticationError(GENERIC_LOGIN_ERROR);
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verifyAgainstDummy(password);
    throw new AuthenticationError("Too many failed attempts. Please try again later or reset your password.");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil,
      })
      .where(eq(users.id, user.id));
    if (failed >= MAX_FAILED_LOGINS) {
      await recordAudit(db, { actor: null, action: "auth.account_locked", entityType: "user", entityId: user.id });
    }
    throw new AuthenticationError(GENERIC_LOGIN_ERROR);
  }

  // Password is correct from here on, so status-specific messages do not enable enumeration.
  if (user.status === "DISABLED") throw new AuthenticationError("This account is not active. Please contact support.");
  if (user.status === "INVITED") throw new AuthenticationError("Please accept your invitation email to set up your account.");
  if (env().REQUIRE_EMAIL_VERIFICATION && !user.emailVerifiedAt) {
    return { ok: false, reason: "unverified", message: "Please verify your email address. We can send you a new verification link." };
  }

  const session = await createSession(user.id, meta);
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await resetRateLimit(RATE_LIMITS.loginByIdentifier, email);
  await recordAudit(db, { actor: { userId: user.id, email: user.email }, action: "auth.login", entityType: "user", entityId: user.id });
  return { ok: true, token: session.token, expiresAt: session.expiresAt, userId: user.id };
}

// ------------------------------------------------------------------ email verification

export async function verifyEmail(token: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const userId = await consumeAuthToken(tx, token, "EMAIL_VERIFICATION");
    if (!userId) return false;
    const [user] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email });
    await recordAudit(tx, { actor: { userId: user.id, email: user.email }, action: "auth.email_verified", entityType: "user", entityId: user.id });
    return true;
  });
}

export async function resendVerificationEmail(emailInput: unknown) {
  const parsed = emailSchema.safeParse(emailInput);
  if (!parsed.success) throw new ValidationError(undefined, { email: ["Enter a valid email address"] });
  const meta = await getRequestMeta();
  await consumeRateLimit(RATE_LIMITS.verificationEmail, `${meta.ipAddress}:${parsed.data}`);
  await db.transaction(async (tx) => {
    const user = await findUserByEmail(tx, parsed.data);
    if (!user || user.emailVerifiedAt || user.status !== "ACTIVE") return;
    const token = await issueAuthToken(tx, user.id, "EMAIL_VERIFICATION");
    await enqueueEmail(tx, {
      to: user.email,
      userId: user.id,
      template: "email_verification",
      email: templates.emailVerification({ name: user.name, url: appUrl(`/verify-email?token=${token}`) }),
      containsSecret: true,
    });
  });
  scheduleDispatch();
}

// ------------------------------------------------------------------ password recovery

export async function requestPasswordReset(emailInput: unknown) {
  const parsed = emailSchema.safeParse(emailInput);
  if (!parsed.success) throw new ValidationError(undefined, { email: ["Enter a valid email address"] });
  const meta = await getRequestMeta();
  await consumeRateLimit(RATE_LIMITS.passwordReset, meta.ipAddress);
  await consumeRateLimit(RATE_LIMITS.passwordReset, parsed.data);
  await db.transaction(async (tx) => {
    const user = await findUserByEmail(tx, parsed.data);
    if (!user || user.status !== "ACTIVE") return; // same response either way
    const token = await issueAuthToken(tx, user.id, "PASSWORD_RESET");
    await enqueueEmail(tx, {
      to: user.email,
      userId: user.id,
      template: "password_reset",
      email: templates.passwordReset({ name: user.name, url: appUrl(`/reset-password?token=${token}`) }),
      containsSecret: true,
    });
    await recordAudit(tx, { actor: null, action: "auth.password_reset_requested", entityType: "user", entityId: user.id });
  });
  scheduleDispatch();
}

export const resetPasswordSchema = z
  .object({ token: z.string().min(10).max(100), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export async function resetPassword(input: unknown) {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const passwordHash = await hashPassword(parsed.data.password);
  await db.transaction(async (tx) => {
    const userId = await consumeAuthToken(tx, parsed.data.token, "PASSWORD_RESET");
    if (!userId) throw new BusinessRuleError("This reset link is invalid or has expired. Please request a new one.");
    const [user] = await tx
      .update(users)
      .set({
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        // Completing a reset proves control of the inbox.
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, name: users.name });
    await invalidateUserSessions(user.id, tx);
    await enqueueEmail(tx, { to: user.email, userId: user.id, template: "password_changed", email: templates.passwordChanged({ name: user.name }) });
    await recordAudit(tx, { actor: { userId: user.id, email: user.email }, action: "auth.password_reset", entityType: "user", entityId: user.id });
  });
  scheduleDispatch();
}

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password"), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export async function changePassword(actor: Actor, currentSessionId: string | null, input: unknown) {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const [user] = await db.select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    throw new ValidationError(undefined, { currentPassword: ["Current password is incorrect"] });
  }
  const passwordHash = await hashPassword(parsed.data.password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, actor.userId));
    await invalidateUserSessions(actor.userId, tx, currentSessionId ?? undefined);
    await enqueueEmail(tx, { to: user.email, userId: user.id, template: "password_changed", email: templates.passwordChanged({ name: user.name }) });
    await recordAudit(tx, { actor: auditActor(actor), action: "auth.password_changed", entityType: "user", entityId: actor.userId });
  });
  scheduleDispatch();
}

// ------------------------------------------------------------------ invitations

export const acceptInvitationSchema = z
  .object({ token: z.string().min(10).max(100), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export async function acceptInvitation(input: unknown) {
  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const passwordHash = await hashPassword(parsed.data.password);
  const meta = await getRequestMeta();
  const userId = await db.transaction(async (tx) => {
    const id = await consumeAuthToken(tx, parsed.data.token, "INVITATION");
    if (!id) throw new BusinessRuleError("This invitation link is invalid or has expired. Ask an administrator to resend it.");
    const [user] = await tx
      .update(users)
      .set({ passwordHash, status: "ACTIVE", emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.status, "INVITED")))
      .returning({ id: users.id, email: users.email });
    if (!user) throw new BusinessRuleError("This invitation is no longer valid.");
    await recordAudit(tx, { actor: { userId: user.id, email: user.email }, action: "auth.invitation_accepted", entityType: "user", entityId: user.id });
    return user.id;
  });
  const session = await createSession(userId, meta);
  return { ...session, userId };
}

export async function logoutAudit(actor: Actor) {
  await recordAudit(db, { actor: auditActor(actor), action: "auth.logout", entityType: "user", entityId: actor.userId });
}
