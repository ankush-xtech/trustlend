"use client";

import type { ReactNode } from "react";
import type { FieldErrors, FieldValues } from "react-hook-form";

/** Reads a nested react-hook-form error message by dotted path. */
export function errorAt<T extends FieldValues>(errors: FieldErrors<T>, path: string): string | undefined {
  let cur: unknown = errors;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  const e = cur as { message?: unknown; root?: { message?: unknown } } | undefined;
  const msg = e?.message ?? e?.root?.message;
  return typeof msg === "string" ? msg : undefined;
}

export function Labelled({ label, htmlFor, error, hint, children, className }: { label: ReactNode; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-invalid:border-destructive";
export const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";
