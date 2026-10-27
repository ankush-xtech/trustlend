import type { ApplicationStatusValue } from "./labels";

/**
 * Application workflow state machine (pure, shared by server and UI).
 *
 * Statuses only change through named actions. Each action declares the statuses it may start from,
 * its target, the permission it requires and its scope:
 *  - "owner": the customer who owns the application, or the agent who created it on their behalf
 *  - "staff": a staff member with an ACTIVE assignment on the application (plus `applications.update_assigned`),
 *             or anyone with `applications.read_all`
 *  - "system": performed by the platform as a side effect of another operation (never directly by users)
 * Business preconditions (e.g. all required documents verified) are enforced by the workflow service.
 */
export type WorkflowAction =
  | "submit"
  | "start_review"
  | "request_information"
  | "information_provided"
  | "complete_documentation"
  | "return_to_review"
  | "internal_recommend"
  | "internal_decline"
  | "submit_to_lender"
  | "lender_acknowledged"
  | "record_lender_approval"
  | "record_lender_rejection"
  | "record_disbursement"
  | "put_on_hold"
  | "resume"
  | "withdraw"
  | "close";

export type ActionScope = "owner" | "staff" | "system";

export interface TransitionDef {
  from: readonly ApplicationStatusValue[];
  /** "HOLD_PREVIOUS" resolves to the status the application had before it was put on hold. */
  to: ApplicationStatusValue | "HOLD_PREVIOUS";
  permission: string | null;
  scope: ActionScope;
  label: string;
  requiresReason?: boolean;
  /** Shown on the customer timeline. */
  customerVisible: boolean;
}

const ACTIVE_PIPELINE: ApplicationStatusValue[] = [
  "SUBMITTED",
  "DOCUMENT_REVIEW",
  "INFORMATION_REQUIRED",
  "READY_FOR_ADMIN_REVIEW",
  "UNDER_PROCESSING",
  "SUBMITTED_TO_LENDER",
  "LENDER_DECISION_PENDING",
  "APPROVED",
];

export const TRANSITIONS: Record<WorkflowAction, TransitionDef> = {
  submit: { from: ["DRAFT"], to: "SUBMITTED", permission: "applications.create", scope: "owner", label: "Submit application", customerVisible: true },
  start_review: { from: ["SUBMITTED"], to: "DOCUMENT_REVIEW", permission: null, scope: "system", label: "Start document review", customerVisible: true },
  request_information: {
    from: ["DOCUMENT_REVIEW", "INFORMATION_REQUIRED"],
    to: "INFORMATION_REQUIRED",
    permission: "applications.request_information",
    scope: "staff",
    label: "Request information",
    customerVisible: true,
  },
  information_provided: { from: ["INFORMATION_REQUIRED"], to: "DOCUMENT_REVIEW", permission: null, scope: "system", label: "Information provided", customerVisible: true },
  complete_documentation: {
    from: ["DOCUMENT_REVIEW"],
    to: "READY_FOR_ADMIN_REVIEW",
    permission: "applications.review_documents",
    scope: "staff",
    label: "Mark documentation complete & hand off",
    customerVisible: true,
  },
  return_to_review: {
    from: ["READY_FOR_ADMIN_REVIEW"],
    to: "DOCUMENT_REVIEW",
    permission: "applications.advance_workflow",
    scope: "staff",
    label: "Return to document review",
    requiresReason: true,
    customerVisible: false,
  },
  internal_recommend: {
    from: ["READY_FOR_ADMIN_REVIEW"],
    to: "UNDER_PROCESSING",
    permission: "applications.record_decision",
    scope: "staff",
    label: "Record internal review: recommended",
    customerVisible: true,
  },
  internal_decline: {
    from: ["READY_FOR_ADMIN_REVIEW"],
    to: "REJECTED",
    permission: "applications.record_decision",
    scope: "staff",
    label: "Record internal review: not recommended",
    requiresReason: true,
    customerVisible: true,
  },
  submit_to_lender: {
    from: ["UNDER_PROCESSING"],
    to: "SUBMITTED_TO_LENDER",
    permission: "applications.advance_workflow",
    scope: "staff",
    label: "Mark submitted to lender",
    customerVisible: true,
  },
  lender_acknowledged: {
    from: ["SUBMITTED_TO_LENDER"],
    to: "LENDER_DECISION_PENDING",
    permission: "applications.advance_workflow",
    scope: "staff",
    label: "Lender acknowledged; decision pending",
    customerVisible: true,
  },
  record_lender_approval: {
    from: ["SUBMITTED_TO_LENDER", "LENDER_DECISION_PENDING"],
    to: "APPROVED",
    permission: "applications.record_decision",
    scope: "staff",
    label: "Record lender approval",
    customerVisible: true,
  },
  record_lender_rejection: {
    from: ["SUBMITTED_TO_LENDER", "LENDER_DECISION_PENDING"],
    to: "REJECTED",
    permission: "applications.record_decision",
    scope: "staff",
    label: "Record lender rejection",
    customerVisible: true,
  },
  record_disbursement: {
    from: ["APPROVED"],
    to: "DISBURSED",
    permission: "applications.record_disbursement",
    scope: "staff",
    label: "Record confirmed disbursement",
    customerVisible: true,
  },
  put_on_hold: {
    from: ACTIVE_PIPELINE,
    to: "ON_HOLD",
    permission: "applications.advance_workflow",
    scope: "staff",
    label: "Put on hold",
    requiresReason: true,
    customerVisible: true,
  },
  resume: { from: ["ON_HOLD"], to: "HOLD_PREVIOUS", permission: "applications.advance_workflow", scope: "staff", label: "Resume", customerVisible: true },
  withdraw: {
    from: ["DRAFT", "SUBMITTED", "DOCUMENT_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_ADMIN_REVIEW", "UNDER_PROCESSING", "ON_HOLD"],
    to: "WITHDRAWN",
    permission: "applications.withdraw_own",
    scope: "owner",
    label: "Withdraw application",
    requiresReason: true,
    customerVisible: true,
  },
  close: {
    from: ["APPROVED", "REJECTED", "DISBURSED", "WITHDRAWN"],
    to: "CLOSED",
    permission: "applications.advance_workflow",
    scope: "staff",
    label: "Close application",
    requiresReason: true,
    customerVisible: true,
  },
};

export interface ActionContext {
  permissions: ReadonlySet<string>;
  /** Customer owner of the application, or the agent who created it (for owner-scoped actions). */
  isOwner: boolean;
  /** Has an ACTIVE assignment on the application. */
  isAssignee: boolean;
}

export interface WorkflowState {
  status: ApplicationStatusValue;
  holdPreviousStatus: ApplicationStatusValue | null;
}

export function resolveTarget(action: WorkflowAction, state: WorkflowState): ApplicationStatusValue | null {
  const def = TRANSITIONS[action];
  if (!def.from.includes(state.status)) return null;
  if (def.to === "HOLD_PREVIOUS") return state.holdPreviousStatus ?? null;
  return def.to;
}

/** Whether an actor context is entitled to perform the action (ignores business preconditions). */
export function isActionPermitted(action: WorkflowAction, state: WorkflowState, ctx: ActionContext): boolean {
  const def = TRANSITIONS[action];
  if (resolveTarget(action, state) === null) return false;
  if (def.scope === "system") return false;
  if (def.permission && !ctx.permissions.has(def.permission)) return false;
  if (def.scope === "owner") return ctx.isOwner;
  // staff scope
  return ctx.permissions.has("applications.read_all") || (ctx.isAssignee && ctx.permissions.has("applications.update_assigned"));
}

export function allowedActions(state: WorkflowState, ctx: ActionContext): WorkflowAction[] {
  return (Object.keys(TRANSITIONS) as WorkflowAction[]).filter((a) => isActionPermitted(a, state, ctx));
}

/** Statuses in which the applicant may edit application data (wizard). */
export const EDITABLE_STATUSES: readonly ApplicationStatusValue[] = ["DRAFT"];
/** Statuses in which the applicant may upload documents. */
export const UPLOAD_STATUSES: readonly ApplicationStatusValue[] = ["DRAFT", "INFORMATION_REQUIRED", "DOCUMENT_REVIEW"];
/** Terminal / inactive statuses (not counted as open). */
export const CLOSED_STATUSES: readonly ApplicationStatusValue[] = ["WITHDRAWN", "REJECTED", "CLOSED", "DISBURSED"];
