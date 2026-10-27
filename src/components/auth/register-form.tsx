"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2Icon, MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import { emailSchema, mobileSchema, passwordSchema, personNameSchema } from "@/lib/validation/common";
import { registerAction } from "@/server/actions/auth";
import { Notice } from "./auth-card";

const clientSchema = z
  .object({
    name: personNameSchema,
    email: emailSchema,
    mobile: mobileSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    acceptTerms: z.boolean().refine((v) => v, "You must accept the terms and privacy notice"),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

type FormInput = z.input<typeof clientSchema>;
type FormOutput = z.output<typeof clientSchema>;

const SERVER_FIELDS = ["name", "email", "mobile", "password", "acceptTerms"] as const;

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, idleState);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: "", email: "", mobile: "", password: "", confirmPassword: "", acceptTerms: false },
    mode: "onTouched",
  });

  useEffect(() => {
    if (state.status !== "error" || !state.fieldErrors) return;
    for (const f of SERVER_FIELDS) {
      const msg = state.fieldErrors[f]?.[0];
      if (msg) setError(f, { type: "server", message: msg });
    }
  }, [state, setError]);

  const onSubmit = (data: FormOutput) => {
    const fd = new FormData();
    fd.set("name", data.name);
    fd.set("email", data.email);
    fd.set("mobile", data.mobile);
    fd.set("password", data.password);
    if (data.acceptTerms) fd.set("acceptTerms", "on");
    startTransition(() => formAction(fd));
  };

  if (state.status === "success") {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-xs" role="status">
        <MailCheckIcon className="mx-auto size-10 text-success" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">Check your inbox</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.message}</p>
        <p className="mt-4 text-sm">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Go to sign in
          </Link>
        </p>
      </div>
    );
  }

  const field = (name: keyof FormInput, label: string, props: React.ComponentProps<"input"> = {}, hint?: string) => {
    const error = errors[name]?.message;
    const id = `reg-${name}`;
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          className="h-10"
          aria-invalid={!!error || undefined}
          aria-describedby={[hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}
          {...props}
          {...register(name)}
        />
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={`${id}-error`} className="text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      {state.status === "error" && state.message ? <Notice tone="error">{state.message}</Notice> : null}
      {field("name", "Full name", { autoComplete: "name" })}
      {field("email", "Email", { type: "email", autoComplete: "email" })}
      {field("mobile", "Mobile number", { type: "tel", inputMode: "tel", autoComplete: "tel" }, "10-digit Indian mobile number.")}
      {field("password", "Password", { type: "password", autoComplete: "new-password" }, "10–64 characters with at least one letter and one number.")}
      {field("confirmPassword", "Confirm password", { type: "password", autoComplete: "new-password" })}
      <div className="grid gap-1">
        <div className="flex items-start gap-2.5">
          <input
            id="reg-acceptTerms"
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            aria-invalid={!!errors.acceptTerms || undefined}
            {...register("acceptTerms")}
          />
          <label htmlFor="reg-acceptTerms" className="text-sm leading-snug">
            I agree to the{" "}
            <Link href="/terms" className="font-medium text-primary hover:underline" target="_blank">
              terms and conditions
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" className="font-medium text-primary hover:underline" target="_blank">
              privacy policy
            </Link>
            .
          </label>
        </div>
        {errors.acceptTerms?.message ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {errors.acceptTerms.message}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="h-10" disabled={pending} aria-busy={pending}>
        {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
