"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import { loginAction, resendVerificationAction } from "@/server/actions/auth";
import { Notice } from "./auth-card";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, idleState);
  const [resendState, resendAction, resendPending] = useActionState(resendVerificationAction, idleState);
  const [email, setEmail] = useState("");
  const unverified = state.status === "error" && state.data?.unverified === true;
  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <div className="grid gap-6">
      {state.status === "error" && state.message ? <Notice tone={unverified ? "warning" : "error"}>{state.message}</Notice> : null}
      <form action={formAction} className="grid gap-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldError("email") || undefined}
            aria-describedby={fieldError("email") ? "email-error" : undefined}
            className="h-10"
          />
          {fieldError("email") ? (
            <p id="email-error" className="text-xs font-medium text-destructive">
              {fieldError("email")}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={!!fieldError("password") || undefined}
            aria-describedby={fieldError("password") ? "password-error" : undefined}
            className="h-10"
          />
          {fieldError("password") ? (
            <p id="password-error" className="text-xs font-medium text-destructive">
              {fieldError("password")}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="h-10" disabled={pending} aria-busy={pending}>
          {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {unverified ? (
        <form action={resendAction} className="grid gap-2 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-medium">Need a new verification link?</p>
          <input type="hidden" name="email" value={email} />
          {resendState.status !== "idle" && resendState.message ? (
            <p className={resendState.status === "error" ? "text-sm text-destructive" : "text-sm text-success"} role="status">
              {resendState.message}
            </p>
          ) : null}
          <Button type="submit" variant="outline" disabled={resendPending || !email}>
            {resendPending ? "Sending…" : "Resend verification email"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
