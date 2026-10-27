"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { idleState, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const FieldErrorsContext = createContext<Record<string, string[] | undefined>>({});

export function useFieldError(name: string) {
  return useContext(FieldErrorsContext)[name]?.[0];
}

/**
 * Progressive-enhancement form bound to a Server Action. Shows field errors inline, an error banner for
 * general errors and a toast on success. Works without JavaScript (plain form POST).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  refreshOnSuccess = true,
  onSuccess,
  showSuccessToast = true,
  id,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  refreshOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  showSuccessToast?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (!state.at) return;
    if (state.status === "success") {
      if (showSuccessToast && state.message) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccessRef.current?.(state);
      if (refreshOnSuccess) router.refresh();
    } else if (state.status === "error" && state.message && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, resetOnSuccess, refreshOnSuccess, showSuccessToast, router]);

  return (
    <FieldErrorsContext.Provider value={state.fieldErrors ?? {}}>
      <form ref={formRef} action={formAction} className={className} id={id} noValidate>
        {state.status === "error" && state.message && state.fieldErrors ? (
          <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.message}
          </div>
        ) : null}
        {children}
      </form>
    </FieldErrorsContext.Provider>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant,
  size,
  className,
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "xs";
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={cn(className)} disabled={pending || disabled} name={name} value={value} aria-busy={pending}>
      {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/** Displays the first validation error for a field rendered inside an ActionForm. */
export function FieldErrorText({ name, id }: { name: string; id?: string }) {
  const error = useFieldError(name);
  if (!error) return null;
  return (
    <p id={id} className="text-xs font-medium text-destructive" role="alert">
      {error}
    </p>
  );
}
