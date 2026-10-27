"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleState, type ActionState } from "@/lib/action-state";
import { SubmitButton } from "./action-form";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Confirmation dialog for sensitive actions. Optionally collects a reason (sent as `reason`).
 * Hidden inputs can be passed via `fields`.
 */
export function ConfirmAction({
  action,
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  reason,
  fields,
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  action: Action;
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  reason?: { label: string; required?: boolean; placeholder?: string };
  fields?: Record<string, string>;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  triggerSize?: "default" | "sm" | "xs" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.status === "success") {
      if (result.message) toast.success(result.message);
      setOpen(false);
      router.refresh();
    } else if (result.message) {
      toast.error(result.message);
    }
    return result;
  }, idleState);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          {fields ? Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
          {reason ? (
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-reason">{reason.label}</Label>
              <Textarea id="confirm-reason" name="reason" required={reason.required} placeholder={reason.placeholder} rows={3} />
              {state.fieldErrors?.reason?.[0] ? <p className="text-xs text-destructive">{state.fieldErrors.reason[0]}</p> : null}
            </div>
          ) : null}
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant={destructive ? "destructive" : "default"}>{confirmLabel}</SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
