"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { ActionForm, SubmitButton } from "./action-form";
import { TextAreaField, TextField } from "./form-controls";
import { Button } from "@/components/ui/button";
import { createTaskAction, setTaskStatusAction } from "@/server/actions/applications";

export function TaskForm({ applicationId, customerId }: { applicationId?: string; customerId?: string }) {
  return (
    <ActionForm action={createTaskAction} className="grid gap-3" resetOnSuccess>
      {applicationId ? <input type="hidden" name="applicationId" value={applicationId} /> : null}
      {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
      <TextField label="Title" name="title" required />
      <TextAreaField label="Details" name="description" rows={2} />
      <TextField label="Due date" name="dueAt" type="date" />
      <div>
        <SubmitButton size="sm">Add task</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function TaskStatusButton({ taskId, status }: { taskId: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const next = status === "OPEN" ? "DONE" : "OPEN";
  return (
    <Button
      size="xs"
      variant={status === "OPEN" ? "secondary" : "ghost"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setTaskStatusAction(taskId, next);
          if (r.status === "error") toast.error(r.message ?? "Failed");
          router.refresh();
        })
      }
    >
      {status === "OPEN" ? <CheckIcon aria-hidden /> : <RotateCcwIcon aria-hidden />}
      {status === "OPEN" ? "Mark done" : "Reopen"}
    </Button>
  );
}
