"use server";

/**
 * SECURITY: every export of a "use server" module is a publicly callable endpoint. Only export
 * actions that validate input and authenticate/authorize inside. Never export helpers that accept
 * a user id or create sessions directly.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { formToObject, runAction, str } from "./run";
import {
  acceptInvitation,
  changePassword,
  login,
  logoutAudit,
  registerCustomer,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
} from "@/server/services/auth";
import { invalidateSessionToken, sessionCookieName, sessionCookieOptions } from "@/server/auth/session";
import { getCurrentActor, getCurrentSessionId, homePathFor, requireActor } from "@/server/auth/current";
import { loadActor } from "@/server/rbac/actor";
import { updateOwnProfile } from "@/server/services/users";
import { safeNextPath } from "@/lib/safe-redirect";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let destination: string | null = null;
  let unverified = false;
  const result = await runAction(async () => {
    const outcome = await login({ email: str(formData, "email"), password: str(formData, "password") });
    if (!outcome.ok) {
      unverified = true;
      return;
    }
    (await cookies()).set(sessionCookieName(), outcome.token, sessionCookieOptions(outcome.expiresAt));
    const actor = await loadActor(outcome.userId);
    destination = safeNextPath(str(formData, "next")) ?? (actor ? homePathFor(actor) : "/");
  });
  if (result.status === "error") return result;
  if (unverified || !destination) {
    return {
      status: "error",
      message: "Please verify your email address before signing in. You can request a new verification link below.",
      data: { unverified: true },
      at: Date.now(),
    };
  }
  redirect(destination);
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    () => registerCustomer(formToObject(formData)),
    "Thanks! If this email can be used, we've sent a verification link. Please check your inbox to activate your account.",
  );
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  const actor = await getCurrentActor();
  if (token) await invalidateSessionToken(token);
  if (actor) await logoutAudit(actor);
  store.delete(sessionCookieName());
  redirect("/login?signedOut=1");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    () => requestPasswordReset(str(formData, "email")),
    "If an account exists for this email, a reset link has been sent. It expires in 30 minutes.",
  );
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction(() => resetPassword(formToObject(formData)));
  if (result.status === "success") redirect("/login?reset=1");
  return result;
}

export async function resendVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(() => resendVerificationEmail(str(formData, "email")), "If the account needs verification, a new link has been sent.");
}

export async function acceptInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let userId: string | null = null;
  const result = await runAction(async () => {
    const session = await acceptInvitation(formToObject(formData));
    (await cookies()).set(sessionCookieName(), session.token, sessionCookieOptions(session.expiresAt));
    userId = session.userId;
  });
  if (result.status === "error") return result;
  const actor = userId ? await loadActor(userId) : null;
  redirect(actor ? homePathFor(actor) : "/login");
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor();
    await changePassword(actor, await getCurrentSessionId(), formToObject(formData));
  }, "Password updated. Other sessions were signed out.");
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => updateOwnProfile(await requireActor(), formToObject(formData)), "Profile updated.");
}
