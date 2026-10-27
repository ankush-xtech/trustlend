"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheckIcon } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { TextField } from "@/components/shared/form-controls";
import { Button } from "@/components/ui/button";
import { idleState } from "@/lib/action-state";
import { acceptInvitationAction, forgotPasswordAction, resetPasswordAction } from "@/server/actions/auth";
import { verifyEmailAction } from "@/server/actions/public";
import { Notice } from "./auth-card";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, idleState);
  if (state.status === "success") {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-xs" role="status">
        <MailCheckIcon className="mx-auto size-10 text-success" aria-hidden />
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{state.message}</p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.status === "error" && state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <div className="grid gap-1.5">
        <label htmlFor="fp-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="fp-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-invalid={!!state.fieldErrors?.email || undefined}
        />
        {state.fieldErrors?.email?.[0] ? <p className="text-xs font-medium text-destructive">{state.fieldErrors.email[0]}</p> : null}
      </div>
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

function PasswordPairForm({ token, action, submitLabel }: { token: string; action: typeof resetPasswordAction; submitLabel: string }) {
  return (
    <ActionForm action={action} className="grid gap-4" refreshOnSuccess={false}>
      <input type="hidden" name="token" value={token} />
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required hint="10–64 characters with at least one letter and one number." />
      <TextField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required />
      <SubmitButton className="h-10" pendingText="Saving…">
        {submitLabel}
      </SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  return <PasswordPairForm token={token} action={resetPasswordAction} submitLabel="Reset password" />;
}

export function AcceptInvitationForm({ token }: { token: string }) {
  return <PasswordPairForm token={token} action={acceptInvitationAction} submitLabel="Set password and continue" />;
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyEmailAction, idleState);
  if (state.status === "success") {
    return (
      <div role="status" className="grid gap-4">
        <Notice tone="success">{state.message}</Notice>
        <Link href="/login?verified=1" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Continue to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      {state.status === "error" && state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Confirming…" : "Confirm my email address"}
      </Button>
    </form>
  );
}
