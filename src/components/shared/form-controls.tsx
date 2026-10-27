"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useFieldError } from "./action-form";

/** Styled native select (accessible, works with FormData and without JavaScript). */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

interface FieldShellProps {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

function FieldShell({ label, name, hint, required, className, children }: FieldShellProps) {
  const id = useId();
  const error = useFieldError(name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-destructive" aria-hidden> *</span> : null}
      </Label>
      {children({ id, describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined, invalid: !!error })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Labelled input for ActionForm (server action) forms. */
export function TextField({
  label,
  name,
  hint,
  required,
  className,
  ...props
}: Omit<ComponentProps<"input">, "name"> & { label: ReactNode; name: string; hint?: ReactNode }) {
  return (
    <FieldShell label={label} name={name} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Input id={id} name={name} required={required} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...props} />
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  name,
  hint,
  required,
  className,
  ...props
}: Omit<ComponentProps<"textarea">, "name"> & { label: ReactNode; name: string; hint?: ReactNode }) {
  return (
    <FieldShell label={label} name={name} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Textarea id={id} name={name} required={required} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...props} />
      )}
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  hint,
  required,
  className,
  options,
  placeholder,
  ...props
}: Omit<ComponentProps<"select">, "name"> & {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  options: readonly (string | { value: string; label: string })[];
  placeholder?: string;
}) {
  return (
    <FieldShell label={label} name={name} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <NativeSelect id={id} name={name} required={required} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...props}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => {
            const opt = typeof o === "string" ? { value: o, label: o } : o;
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            );
          })}
        </NativeSelect>
      )}
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  description,
  className,
  ...props
}: Omit<ComponentProps<"input">, "name" | "type"> & { label: ReactNode; name: string; description?: ReactNode }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          name={name}
          className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
          aria-invalid={!!error || undefined}
          {...props}
        />
        <div className="grid gap-0.5">
          <label htmlFor={id} className="text-sm font-medium leading-snug">
            {label}
          </label>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
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
