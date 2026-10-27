"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import type { FieldErrors, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/shared/form-controls";
import { cn } from "@/lib/utils";

/** Reads a nested RHF error message by dotted path (e.g. "references.0.mobile"). */
export function errorAt(errors: FieldErrors, path: string): string | undefined {
  let cur: unknown = errors;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  const msg = (cur as { message?: unknown } | undefined)?.message;
  return typeof msg === "string" ? msg : undefined;
}

interface BaseProps<T extends FieldValues> {
  name: Path<T>;
  label: ReactNode;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

function Shell({ id, label, hint, error, required, className, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive" aria-hidden> *</span> : null}
      </Label>
      {children}
      {hint && !error ? (
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
}

export function RInput<T extends FieldValues>({
  name,
  label,
  register,
  errors,
  hint,
  required,
  className,
  ...props
}: BaseProps<T> & Omit<ComponentProps<"input">, "name">) {
  const id = useId();
  const error = errorAt(errors as FieldErrors, name);
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <Input
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        aria-required={required || undefined}
        {...props}
        {...register(name)}
      />
    </Shell>
  );
}

export function RTextarea<T extends FieldValues>({
  name,
  label,
  register,
  errors,
  hint,
  required,
  className,
  ...props
}: BaseProps<T> & Omit<ComponentProps<"textarea">, "name">) {
  const id = useId();
  const error = errorAt(errors as FieldErrors, name);
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <Textarea
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
        {...register(name)}
      />
    </Shell>
  );
}

export function RSelect<T extends FieldValues>({
  name,
  label,
  register,
  errors,
  hint,
  required,
  className,
  options,
  placeholder = "Select…",
  valueAsNumber,
}: BaseProps<T> & { options: readonly (string | { value: string | number; label: string })[]; placeholder?: string; valueAsNumber?: boolean }) {
  const id = useId();
  const error = errorAt(errors as FieldErrors, name);
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <NativeSelect
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...register(name, valueAsNumber ? { setValueAs: (v) => (v === "" ? undefined : Number(v)) } : undefined)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={String(opt.value)} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </NativeSelect>
    </Shell>
  );
}

export function RCheckbox<T extends FieldValues>({ name, label, register, errors, hint, className }: Omit<BaseProps<T>, "required">) {
  const id = useId();
  const error = errorAt(errors as FieldErrors, name);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-start gap-2.5">
        <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" aria-invalid={!!error || undefined} {...register(name)} />
        <div className="grid gap-0.5">
          <label htmlFor={id} className="text-sm font-medium leading-snug">
            {label}
          </label>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {description ? <p className="-mt-2 text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </fieldset>
  );
}
