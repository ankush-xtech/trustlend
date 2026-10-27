"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { NativeSelect } from "@/components/shared/form-controls";
import { createDraftAction } from "@/server/actions/applications";
import { inviteCustomerAction } from "@/server/actions/agent";

export function StartForCustomer({ customerId, products }: { customerId: string; products: { id: string; name: string }[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  return (
    <ActionForm action={createDraftAction} className="flex flex-wrap items-end gap-2" showSuccessToast={false} refreshOnSuccess={false}>
      <input type="hidden" name="customerId" value={customerId} />
      <label className="grid gap-1 text-sm font-medium">
        Loan product
        <NativeSelect name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} className="min-w-[14rem]">
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <SubmitButton pendingText="Creating…">Start application</SubmitButton>
    </ActionForm>
  );
}

export function InviteCustomerButton({ customerId }: { customerId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await inviteCustomerAction(customerId);
          if (r.status === "success") toast.success(r.message ?? "Invitation sent");
          else toast.error(r.message ?? "Could not send invitation");
          router.refresh();
        })
      }
    >
      Invite to customer portal
    </Button>
  );
}
