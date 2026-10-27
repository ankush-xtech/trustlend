"use client";

import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { NativeSelect } from "@/components/shared/form-controls";
import { assignAction } from "@/server/actions/applications";

export function QuickAssign({ applicationId, staff }: { applicationId: string; staff: { id: string; name: string }[] }) {
  return (
    <ActionForm action={assignAction.bind(null, applicationId)} className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={`assign-${applicationId}`}>
        Assignee
      </label>
      <NativeSelect id={`assign-${applicationId}`} name="assigneeId" required className="h-8 w-40" defaultValue="">
        <option value="" disabled>
          Select…
        </option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </NativeSelect>
      <input type="hidden" name="stage" value="DOCUMENT_REVIEW" />
      <SubmitButton size="sm">Assign</SubmitButton>
    </ActionForm>
  );
}
