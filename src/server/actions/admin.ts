"use server";

/**
 * Admin Server Actions. SECURITY: every export here is a publicly callable endpoint. Each action
 * resolves the actor from the session (requireActor) and delegates to a service that enforces
 * permissions, record access and business rules. Identifiers from the form are validated by services.
 */
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireActor } from "@/server/auth/current";
import { formToObject, runAction, str } from "./run";
import {
  assignRoleToUser,
  createUserWithInvitation,
  removeRoleFromUser,
  resendInvitation,
  setUserStatus,
  updateUser,
} from "@/server/services/users";
import { createRole, setRolePermissions, updateRole } from "@/server/services/roles";
import { inviteCustomerToPortal, updateCustomer } from "@/server/services/customers";
import { reviewReferral, revokeReferral } from "@/server/services/referrals";
import { onboardAgent, setAgentStatus, updateAgent } from "@/server/services/agents";
import { createProduct, setProductDocuments, updateProduct } from "@/server/services/products";
import {
  addCommissionAdjustment,
  approveCommission,
  cancelCommission,
  createCommissionRule,
  flagCommissionForAdjustment,
  recordCommissionPayment,
  updateCommissionRule,
} from "@/server/services/commissions";
import { SETTINGS, updateSettings } from "@/server/services/settings";
import { retryNotification } from "@/server/services/notifications";

function list(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === "string" && v.length > 0);
}

// ------------------------------------------------------------------ users

export async function inviteUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string | null = null;
  const result = await runAction(async () => {
    id = await createUserWithInvitation(await requireActor(), {
      name: str(formData, "name"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      roleIds: list(formData, "roleIds"),
    });
  });
  if (result.status === "success" && id) redirect(`/admin/users/${id}?invited=1`);
  return result;
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => updateUser(await requireActor(), str(formData, "userId"), { name: str(formData, "name"), phone: str(formData, "phone") }), "User updated.");
}

export async function setUserStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const status = str(formData, "status") === "ACTIVE" ? "ACTIVE" : "DISABLED";
  return runAction(
    async () => setUserStatus(await requireActor(), str(formData, "userId"), status, str(formData, "reason")),
    status === "ACTIVE" ? "User activated." : "User deactivated and signed out everywhere.",
  );
}

export async function assignRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => assignRoleToUser(await requireActor(), str(formData, "userId"), str(formData, "roleId")), "Role assigned.");
}

export async function removeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => removeRoleFromUser(await requireActor(), str(formData, "userId"), str(formData, "roleId")), "Role removed.");
}

export async function resendInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => resendInvitation(await requireActor(), str(formData, "userId")), "Invitation re-sent.");
}

// ------------------------------------------------------------------ roles

export async function createRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string | null = null;
  const result = await runAction(async () => {
    id = await createRole(await requireActor(), {
      key: str(formData, "key"),
      name: str(formData, "name"),
      description: str(formData, "description"),
      permissionKeys: list(formData, "permissionKeys"),
    });
  });
  if (result.status === "success" && id) redirect(`/admin/roles/${id}?created=1`);
  return result;
}

export async function updateRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    async () =>
      updateRole(await requireActor(), str(formData, "roleId"), {
        name: str(formData, "name"),
        description: str(formData, "description"),
        isActive: formData.get("isActive") === "on",
      }),
    "Role updated.",
  );
}

export async function setRolePermissionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => setRolePermissions(await requireActor(), str(formData, "roleId"), list(formData, "permissionKeys")), "Permissions saved. Changes apply on users' next request.");
}

// ------------------------------------------------------------------ customers & referrals

export async function updateCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { customerId, ...rest } = formToObject(formData);
    await updateCustomer(await requireActor(), String(customerId ?? ""), rest);
  }, "Customer updated.");
}

export async function inviteCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => inviteCustomerToPortal(await requireActor(), str(formData, "customerId")), "Portal invitation sent to the customer.");
}

export async function revokeReferralAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => revokeReferral(await requireActor(), str(formData, "referralId"), str(formData, "reason")), "Referral revoked.");
}

export async function reviewReferralAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const decision = str(formData, "decision") === "APPROVE" ? "APPROVE" : "REJECT";
  return runAction(
    async () => reviewReferral(await requireActor(), str(formData, "referralId"), decision, str(formData, "reason")),
    decision === "APPROVE" ? "Referral approved." : "Referral rejected.",
  );
}

// ------------------------------------------------------------------ agents

export async function onboardAgentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id: string | null = null;
  const result = await runAction(async () => {
    id = await onboardAgent(await requireActor(), formToObject(formData));
  });
  if (result.status === "success" && id) redirect(`/admin/agents/${id}?created=1`);
  return result;
}

export async function updateAgentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { agentId, ...rest } = formToObject(formData);
    await updateAgent(await requireActor(), String(agentId ?? ""), rest);
  }, "Agent updated.");
}

export async function setAgentStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const status = str(formData, "status") === "ACTIVE" ? "ACTIVE" : "SUSPENDED";
  return runAction(
    async () => setAgentStatus(await requireActor(), str(formData, "agentId"), status, str(formData, "reason")),
    status === "ACTIVE" ? "Agent reactivated." : "Agent suspended.",
  );
}

// ------------------------------------------------------------------ products (called directly from RHF forms)

export async function saveProductAction(productId: string | null, data: unknown): Promise<ActionState> {
  let id: string | null = productId;
  const result = await runAction(async () => {
    const actor = await requireActor();
    if (productId) await updateProduct(actor, productId, data);
    else id = await createProduct(actor, data);
  }, "Product saved.");
  return { ...result, data: id ? { id } : undefined };
}

export async function saveProductDocumentsAction(productId: string, docs: unknown): Promise<ActionState> {
  return runAction(async () => setProductDocuments(await requireActor(), productId, docs), "Document requirements saved.");
}

// ------------------------------------------------------------------ commissions

export async function approveCommissionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const v = Number(str(formData, "version"));
  return runAction(
    async () => approveCommission(await requireActor(), str(formData, "commissionId"), { expectedVersion: Number.isFinite(v) && v > 0 ? v : undefined, notes: str(formData, "reason") || undefined }),
    "Commission approved.",
  );
}

export async function flagCommissionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => flagCommissionForAdjustment(await requireActor(), str(formData, "commissionId"), str(formData, "reason")), "Commission flagged for adjustment.");
}

export async function adjustCommissionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    async () => addCommissionAdjustment(await requireActor(), str(formData, "commissionId"), { amount: str(formData, "amount"), reason: str(formData, "reason") }),
    "Adjustment recorded. The commission needs re-approval.",
  );
}

export async function cancelCommissionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => cancelCommission(await requireActor(), str(formData, "commissionId"), str(formData, "reason")), "Commission cancelled.");
}

export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { commissionId, ...rest } = formToObject(formData);
    await recordCommissionPayment(await requireActor(), String(commissionId ?? ""), rest);
  }, "Payment recorded.");
}

export async function saveCommissionRuleAction(ruleId: string | null, data: unknown): Promise<ActionState> {
  let id: string | null = ruleId;
  const result = await runAction(async () => {
    const actor = await requireActor();
    if (ruleId) await updateCommissionRule(actor, ruleId, data);
    else id = await createCommissionRule(actor, data);
  }, "Commission rule saved.");
  return { ...result, data: id ? { id } : undefined };
}

// ------------------------------------------------------------------ platform

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Setting keys contain dots, so read them flat (the last value wins: hidden "false" then checkbox "on").
  const input: Record<string, unknown> = {};
  for (const key of Object.keys(SETTINGS)) {
    const values = formData.getAll(key).filter((v): v is string => typeof v === "string");
    if (values.length) input[key] = values[values.length - 1];
  }
  return runAction(async () => updateSettings(await requireActor(), input), "Settings saved.");
}

export async function retryNotificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => retryNotification(await requireActor(), str(formData, "notificationId")), "Notification queued for retry.");
}
