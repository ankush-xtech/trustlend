import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { issueAuthToken, login, registerCustomer, requestPasswordReset, resetPassword, verifyEmail } from "@/server/services/auth";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { setUserStatus } from "@/server/services/users";
import { AuthenticationError, BusinessRuleError, ValidationError } from "@/server/errors";
import { actorFor, createUser, PASSWORD, resetDatabase } from "./helpers";

beforeAll(async () => {
  await resetDatabase();
});

describe("registration", () => {
  it("creates only a customer account and queues a verification email", async () => {
    await registerCustomer({ name: "New Person", email: "New.Person@IT.test", mobile: "9876512345", password: "Strong-pass-1", acceptTerms: true, roleIds: ["anything"] });
    const [user] = await db.select().from(s.users).where(eq(s.users.email, "new.person@it.test"));
    expect(user.status).toBe("ACTIVE");
    expect(user.emailVerifiedAt).toBeNull();
    const actor = await actorFor(user.id);
    expect(actor.roleKeys).toEqual(["customer"]);
    expect(actor.permissions.has("portal.admin")).toBe(false);
    const mails = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, user.id), eq(s.notifications.template, "email_verification")));
    expect(mails).toHaveLength(1);
    expect(mails[0].containsSecret).toBe(true);
  });

  it("does not reveal whether an email is already registered", async () => {
    await expect(
      registerCustomer({ name: "Someone Else", email: "new.person@it.test", mobile: "9876512346", password: "Strong-pass-1", acceptTerms: true }),
    ).resolves.toBeUndefined();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users).where(sql`lower(email) = 'new.person@it.test'`);
    expect(n).toBe(1);
    const notices = await db.select().from(s.notifications).where(eq(s.notifications.template, "account_exists"));
    expect(notices.length).toBeGreaterThan(0);
  });

  it("rejects weak passwords and missing consent", async () => {
    await expect(registerCustomer({ name: "Weak Pw", email: "weak@it.test", mobile: "9876512347", password: "short", acceptTerms: true })).rejects.toBeInstanceOf(ValidationError);
    await expect(registerCustomer({ name: "No Terms", email: "noterms@it.test", mobile: "9876512348", password: "Strong-pass-1" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("login, verification and lockout", () => {
  it("blocks unverified accounts until the single-use verification token is consumed", async () => {
    const user = await createUser("customer", { verified: false });
    const first = await login({ email: user.email, password: PASSWORD });
    expect(first.ok).toBe(false);
    const token = await db.transaction((tx) => issueAuthToken(tx, user.id, "EMAIL_VERIFICATION"));
    expect(await verifyEmail(token)).toBe(true);
    expect(await verifyEmail(token)).toBe(false); // single use
    const second = await login({ email: user.email, password: PASSWORD });
    expect(second.ok).toBe(true);
  });

  it("uses a generic error for unknown users and wrong passwords", async () => {
    const user = await createUser("customer");
    await expect(login({ email: "nobody@it.test", password: "whatever-1" })).rejects.toThrow("Invalid email or password.");
    await expect(login({ email: user.email, password: "wrong-password-1" })).rejects.toThrow("Invalid email or password.");
  });

  it("locks the account after repeated failures", async () => {
    const user = await createUser("customer");
    for (let i = 0; i < 5; i++) {
      await login({ email: user.email, password: "wrong-password-1" }).catch(() => undefined);
    }
    // Even the right password is refused during the lockout window (rate limit or lock).
    await expect(login({ email: user.email, password: PASSWORD })).rejects.toBeInstanceOf(Error);
    const [row] = await db.select().from(s.users).where(eq(s.users.id, user.id));
    expect(row.lockedUntil && row.lockedUntil > new Date()).toBe(true);
  });

  it("stores only hashed session tokens and validates them", async () => {
    const user = await createUser("customer");
    const res = await login({ email: user.email, password: PASSWORD });
    if (!res.ok) throw new Error("login failed");
    const rows = await db.select().from(s.sessions).where(eq(s.sessions.userId, user.id));
    expect(rows.some((r) => r.id === res.token)).toBe(false);
    expect((await validateSessionToken(res.token))?.userId).toBe(user.id);
    expect(await validateSessionToken("forged-token")).toBeNull();
  });

  it("invalidates sessions of a deactivated user immediately", async () => {
    const admin = await actorFor((await createUser("admin")).id);
    const user = await createUser("customer");
    const session = await createSession(user.id, { ipAddress: null, userAgent: null });
    expect(await validateSessionToken(session.token)).not.toBeNull();
    await setUserStatus(admin, user.id, "DISABLED", "Fraud investigation");
    expect(await validateSessionToken(session.token)).toBeNull();
    await expect(login({ email: user.email, password: PASSWORD })).rejects.toBeInstanceOf(AuthenticationError);
    expect(await actorFor(user.id).catch(() => null)).toBeNull();
  });
});

describe("password recovery", () => {
  it("resets with a single-use token, revokes sessions and rejects reuse", async () => {
    const user = await createUser("customer");
    const session = await createSession(user.id, { ipAddress: null, userAgent: null });
    await requestPasswordReset(user.email);
    const token = await db.transaction((tx) => issueAuthToken(tx, user.id, "PASSWORD_RESET"));
    await resetPassword({ token, password: "Brand-new-pass-9", confirmPassword: "Brand-new-pass-9" });
    expect(await validateSessionToken(session.token)).toBeNull();
    await expect(resetPassword({ token, password: "Another-pass-9", confirmPassword: "Another-pass-9" })).rejects.toBeInstanceOf(BusinessRuleError);
    expect((await login({ email: user.email, password: "Brand-new-pass-9" })).ok).toBe(true);
  });

  it("rejects expired tokens", async () => {
    const user = await createUser("customer");
    const token = await db.transaction((tx) => issueAuthToken(tx, user.id, "PASSWORD_RESET"));
    await db.update(s.authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.authTokens.userId, user.id));
    await expect(resetPassword({ token, password: "Brand-new-pass-9", confirmPassword: "Brand-new-pass-9" })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("responds identically for unknown emails", async () => {
    await expect(requestPasswordReset("does-not-exist@it.test")).resolves.toBeUndefined();
  });
});
