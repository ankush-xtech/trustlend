"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { CheckboxField, TextAreaField, TextField } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/display";
import { referCustomerAction } from "@/server/actions/agent";
import type { ActionState } from "@/lib/action-state";

export function ReferForm() {
  const [result, setResult] = useState<ActionState | null>(null);
  const outcome = result?.data?.outcome as string | undefined;
  const customerId = result?.data?.customerId as string | null | undefined;
  return (
    <div className="grid gap-6">
      {result && outcome ? (
        <div className={`rounded-xl border p-4 text-sm ${outcome === "SUBMITTED_FOR_REVIEW" ? "border-warning/40 bg-warning/10" : "border-success/30 bg-success/10"}`} role="status">
          <p className="font-medium">{result.message}</p>
          {customerId ? (
            <div className="mt-3">
              <LinkButton href={`/agent/customers/${customerId}`} size="sm">
                Open customer & start application
              </LinkButton>
            </div>
          ) : null}
        </div>
      ) : null}
      <ActionForm action={referCustomerAction} className="grid max-w-xl gap-4" resetOnSuccess onSuccess={(s) => setResult(s)} refreshOnSuccess={false} showSuccessToast={false}>
        <TextField label="Customer full name" name="fullName" required autoComplete="off" />
        <TextField label="Customer email" name="email" type="email" required autoComplete="off" />
        <TextField label="Customer mobile" name="mobile" required inputMode="tel" autoComplete="off" />
        <TextAreaField label="Notes (optional)" name="notes" rows={3} hint="Context for the TrustLend team. Do not include identity numbers or bank details." />
        <CheckboxField
          name="consent"
          label="The customer has agreed to be referred to TrustLend and to be contacted about a loan application."
          description="Referrals without the customer's consent are not permitted."
        />
        <div>
          <SubmitButton pendingText="Submitting…">Submit referral</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
