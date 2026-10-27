import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { WizardState } from "@/server/services/applications";

export type { WizardState };

export interface StepProps {
  state: WizardState;
  version: number;
  disabled: boolean;
  /** Persist the step on the server; resolves true when saved. */
  save: (step: 1 | 2 | 3 | 4, data: unknown) => Promise<{ ok: boolean; fieldErrors?: Record<string, string[] | undefined> }>;
  onBack?: () => void;
}

/** Applies server-side field errors (dotted paths) to a React Hook Form instance. */
export function applyServerErrors<T extends FieldValues>(setError: UseFormSetError<T>, fieldErrors: Record<string, string[] | undefined> | undefined) {
  if (!fieldErrors) return;
  for (const [path, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) setError(path as Path<T>, { type: "server", message: messages[0] });
  }
}
