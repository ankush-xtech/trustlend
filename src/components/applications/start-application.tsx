"use client";

import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { createDraftAction } from "@/server/actions/applications";

/** Starts a draft for a product. Attribution and customer are decided on the server. */
export function StartApplicationButton({ productId, customerId, label = "Start application" }: { productId: string; customerId?: string; label?: string }) {
  return (
    <ActionForm action={createDraftAction} showSuccessToast={false} refreshOnSuccess={false}>
      <input type="hidden" name="productId" value={productId} />
      {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
      <SubmitButton pendingText="Creating…">{label}</SubmitButton>
    </ActionForm>
  );
}
