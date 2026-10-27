"use server";

import type { ActionState } from "@/lib/action-state";
import { requireActor } from "@/server/auth/current";
import { formToObject, runAction } from "./run";
import { referCustomer } from "@/server/services/referrals";
import { inviteCustomerToPortal } from "@/server/services/customers";

const OUTCOME_MESSAGES = {
  CREATED: "Customer referred. You can now start an application for them.",
  ALREADY_REFERRED_BY_YOU: "You have already referred this customer.",
  SUBMITTED_FOR_REVIEW: "We couldn't create a new referral automatically for these details. It has been submitted to our team for review.",
} as const;

export async function referCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    async () => referCustomer(await requireActor(), formToObject(formData)),
    (r) => OUTCOME_MESSAGES[r.status],
    (r) => ({ outcome: r.status, customerId: "customerId" in r ? r.customerId : null }),
  );
}

export async function inviteCustomerAction(customerId: string): Promise<ActionState> {
  return runAction(async () => inviteCustomerToPortal(await requireActor(), customerId), "Invitation sent to the customer.");
}
