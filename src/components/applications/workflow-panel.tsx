"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/shared/form-controls";
import { ConfirmAction } from "@/components/shared/confirm-action";
import {
  completeDocumentationAction,
  disbursementAction,
  internalReviewAction,
  lenderDecisionAction,
  requestInformationAction,
  simpleWorkflowAction,
  submitToLenderAction,
} from "@/server/actions/applications";
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategoryValue } from "@/lib/domain/labels";
import type { WorkflowAction } from "@/lib/domain/workflow";
import { todayIso } from "@/lib/format";

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Staff workflow controls. Only actions permitted by the state machine for this actor are rendered; the server re-checks everything. */
export function WorkflowPanel({
  applicationId,
  version,
  actions,
  lenderName,
  approvedAmount,
  approvedTenure,
  blockers,
  categories,
  afterHandoffHref,
}: {
  applicationId: string;
  version: number;
  actions: WorkflowAction[];
  lenderName: string | null;
  approvedAmount: string | null;
  approvedTenure: number | null;
  blockers: string[];
  categories: string[];
  /** Where to go after hand-off when the actor loses access (assigned officer). */
  afterHandoffHref?: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const has = (a: WorkflowAction) => actions.includes(a);
  const v = <input type="hidden" name="expectedVersion" value={version} />;
  const staffActions = actions.filter((a) => a !== "submit" && a !== "withdraw");
  if (!staffActions.length) {
    return <p className="text-sm text-muted-foreground">No workflow actions are available to you at this stage.</p>;
  }

  return (
    <div className="grid gap-4">
      {has("request_information") ? (
        <Panel title="Request information" description="The applicant is notified and the application moves to “Information required”.">
          <ActionForm action={requestInformationAction.bind(null, applicationId)} className="grid gap-3" resetOnSuccess>
            <TextAreaField label="What do you need from the applicant?" name="message" rows={3} required />
            {categories.length ? (
              <fieldset className="grid gap-1.5">
                <legend className="mb-1 text-sm font-medium">Documents to re-upload (optional)</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {categories.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="requestedCategories" value={c} className="accent-[var(--primary)]" />
                      {DOCUMENT_CATEGORY_LABELS[c as DocumentCategoryValue] ?? c}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div>
              <SubmitButton size="sm">Send request</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {has("complete_documentation") ? (
        <Panel title="Complete documentation & hand off" description="Requires all required documents verified, none pending and no unresolved requests. This is not a loan approval.">
          {blockers.length ? (
            <ul className="mb-3 list-disc pl-5 text-sm text-[oklch(0.42_0.1_65)]">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          <ActionForm
            action={completeDocumentationAction.bind(null, applicationId)}
            className="grid gap-3"
            refreshOnSuccess={!afterHandoffHref}
            onSuccess={() => {
              if (afterHandoffHref) router.push(afterHandoffHref);
            }}
          >
            {v}
            <TextAreaField label="Hand-off notes (internal)" name="notes" rows={2} />
            <div>
              <SubmitButton size="sm" disabled={blockers.length > 0}>
                Mark documentation complete
              </SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {has("internal_recommend") || has("internal_decline") ? (
        <Panel title="Internal review outcome" description="Internal recommendation only — the lender makes the credit decision.">
          <ActionForm action={internalReviewAction.bind(null, applicationId)} className="grid gap-3">
            {v}
            <SelectField
              label="Outcome"
              name="outcome"
              required
              options={[
                ...(has("internal_recommend") ? [{ value: "RECOMMENDED", label: "Recommended — proceed to lender submission" }] : []),
                ...(has("internal_decline") ? [{ value: "NOT_RECOMMENDED", label: "Not recommended — reject internally" }] : []),
              ]}
            />
            <TextAreaField label="Review notes (internal)" name="notes" rows={3} required />
            <div>
              <SubmitButton size="sm">Record outcome</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {has("submit_to_lender") ? (
        <Panel title="Submit to lender" description="Record that the file was shared with a lending partner (no lender integration is configured).">
          <ActionForm action={submitToLenderAction.bind(null, applicationId)} className="grid gap-3 sm:grid-cols-2">
            {v}
            <TextField label="Lender name" name="lenderName" required defaultValue={lenderName ?? ""} />
            <TextField label="Lender reference (optional)" name="lenderReference" />
            <div className="sm:col-span-2">
              <SubmitButton size="sm">Mark submitted to lender</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {has("record_lender_approval") || has("record_lender_rejection") ? (
        <Panel title="Record lender decision" description="Record only externally confirmed decisions (e.g. sanction letter). Stored separately from the internal review.">
          <ActionForm action={lenderDecisionAction.bind(null, applicationId)} className="grid gap-3 sm:grid-cols-2">
            {v}
            <label className="grid gap-1.5 text-sm font-medium">
              Decision
              <select
                name="decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value as "APPROVED" | "REJECTED")}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="APPROVED">Approved by lender</option>
                <option value="REJECTED">Rejected by lender</option>
              </select>
            </label>
            <TextField label="Lender name" name="lenderName" required defaultValue={lenderName ?? ""} />
            <TextField label="Lender reference" name="lenderReference" />
            <TextField label="Decision date" name="decisionDate" type="date" required max={todayIso()} defaultValue={todayIso()} />
            {decision === "APPROVED" ? (
              <>
                <TextField label="Approved amount (₹)" name="approvedAmount" inputMode="decimal" required />
                <TextField label="Approved tenure (months)" name="approvedTenureMonths" type="number" min={1} />
              </>
            ) : null}
            <TextAreaField label="Evidence / confirmation" name="evidenceNote" rows={2} required className="sm:col-span-2" hint="e.g. Sanction letter ref and date, or lender portal confirmation." />
            <div className="sm:col-span-2">
              <SubmitButton size="sm">Record decision</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {has("record_disbursement") ? (
        <Panel title="Record confirmed disbursement" description="Only record a disbursement confirmed by the lender. For agent-referred applications this creates the commission record for verification.">
          <ActionForm action={disbursementAction.bind(null, applicationId)} className="grid gap-3 sm:grid-cols-2">
            {v}
            <TextField label="Disbursed principal (₹)" name="amount" inputMode="decimal" required defaultValue={approvedAmount ?? ""} hint={approvedAmount ? `Cannot exceed the approved amount${approvedTenure ? ` (${approvedTenure} months)` : ""}.` : undefined} />
            <TextField label="Disbursement date" name="disbursedOn" type="date" required max={todayIso()} defaultValue={todayIso()} />
            <TextField label="Lender disbursement reference" name="lenderReference" required />
            <TextAreaField label="How was it confirmed?" name="confirmationSource" rows={2} required className="sm:col-span-2" hint="e.g. Disbursement advice email from lender dated …" />
            <div className="sm:col-span-2">
              <SubmitButton size="sm">Record disbursement</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {has("lender_acknowledged") || has("put_on_hold") || has("resume") || has("return_to_review") || has("close") ? (
        <Panel title="Other actions">
          <div className="flex flex-wrap gap-2">
            {has("lender_acknowledged") ? (
              <ConfirmAction
                action={simpleWorkflowAction.bind(null, applicationId, "lender_acknowledged")}
                trigger="Lender acknowledged"
                title="Mark lender decision pending?"
                description="Use when the lender has acknowledged the file and its decision is pending."
                fields={{ expectedVersion: String(version) }}
              />
            ) : null}
            {has("return_to_review") ? (
              <ConfirmAction
                action={simpleWorkflowAction.bind(null, applicationId, "return_to_review")}
                trigger="Return to document review"
                title="Return to document review?"
                reason={{ label: "Reason", required: true }}
                fields={{ expectedVersion: String(version) }}
              />
            ) : null}
            {has("put_on_hold") ? (
              <ConfirmAction
                action={simpleWorkflowAction.bind(null, applicationId, "put_on_hold")}
                trigger="Put on hold"
                title="Put this application on hold?"
                description="Processing pauses until it is resumed. The applicant sees “On hold”."
                reason={{ label: "Reason", required: true }}
                fields={{ expectedVersion: String(version) }}
              />
            ) : null}
            {has("resume") ? (
              <ConfirmAction action={simpleWorkflowAction.bind(null, applicationId, "resume")} trigger="Resume" title="Resume processing?" fields={{ expectedVersion: String(version) }} />
            ) : null}
            {has("close") ? (
              <ConfirmAction
                action={simpleWorkflowAction.bind(null, applicationId, "close")}
                trigger="Close application"
                title="Close this application?"
                reason={{ label: "Closing reason", required: true }}
                destructive
                fields={{ expectedVersion: String(version) }}
              />
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

export function NoteForm({ action }: { action: (prev: import("@/lib/action-state").ActionState, fd: FormData) => Promise<import("@/lib/action-state").ActionState> }) {
  return (
    <ActionForm action={action} className="grid gap-3" resetOnSuccess>
      <TextAreaField label="Add a note" name="body" rows={2} required />
      <CheckboxField label="Visible to the customer" name="visibility" value="CUSTOMER_VISIBLE" description="Leave unticked for internal-only notes." />
      <div>
        <SubmitButton size="sm" variant="secondary">
          Add note
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
