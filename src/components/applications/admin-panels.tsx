"use client";

import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { SelectField, TextAreaField } from "@/components/shared/form-controls";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { assignAction, changeAttributionAction, releaseAssignmentAction } from "@/server/actions/applications";

export function AssignmentPanel({
  applicationId,
  staff,
  currentAssigneeId,
}: {
  applicationId: string;
  staff: { id: string; name: string; email: string }[];
  currentAssigneeId: string | null;
}) {
  return (
    <div className="grid gap-3">
      <ActionForm action={assignAction.bind(null, applicationId)} className="grid gap-3">
        <SelectField
          label={currentAssigneeId ? "Reassign to" : "Assign to"}
          name="assigneeId"
          required
          placeholder="Select staff member…"
          options={staff.filter((s) => s.id !== currentAssigneeId).map((s) => ({ value: s.id, label: `${s.name} (${s.email})` }))}
        />
        <SelectField
          label="Stage"
          name="stage"
          options={[
            { value: "DOCUMENT_REVIEW", label: "Document review" },
            { value: "PROCESSING", label: "Processing" },
          ]}
        />
        <TextAreaField label="Notes (internal)" name="notes" rows={2} />
        <p className="text-xs text-muted-foreground">Assignment never changes the referring agent or commission entitlement.</p>
        <div>
          <SubmitButton size="sm">{currentAssigneeId ? "Reassign" : "Assign"}</SubmitButton>
        </div>
      </ActionForm>
      {currentAssigneeId ? (
        <ConfirmAction action={releaseAssignmentAction.bind(null, applicationId)} trigger="Release assignment" title="Release the current assignment?" reason={{ label: "Reason", required: true }} />
      ) : null}
    </div>
  );
}

export function AttributionPanel({ applicationId, agents, currentAgentId }: { applicationId: string; agents: { id: string; label: string }[]; currentAgentId: string | null }) {
  return (
    <ActionForm action={changeAttributionAction.bind(null, applicationId)} className="grid gap-3">
      <SelectField
        label="Referring agent"
        name="agentId"
        defaultValue={currentAgentId ?? ""}
        options={[{ value: "", label: "None — direct application" }, ...agents.map((a) => ({ value: a.id, label: a.label }))]}
      />
      <TextAreaField label="Reason (audited)" name="reason" rows={2} required hint="Explain the dispute outcome or evidence for this change." />
      <p className="text-xs text-muted-foreground">Blocked once a commission exists for this application; cancel a pending commission first.</p>
      <div>
        <SubmitButton size="sm" variant="destructive">
          Change attribution
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
