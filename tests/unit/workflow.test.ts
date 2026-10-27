import { describe, expect, it } from "vitest";
import { allowedActions, isActionPermitted, resolveTarget, TRANSITIONS, type ActionContext } from "@/lib/domain/workflow";

const perms = (...p: string[]) => new Set(p);
const officer: ActionContext = {
  permissions: perms("applications.update_assigned", "applications.review_documents", "applications.request_information", "applications.read_assigned"),
  isOwner: false,
  isAssignee: true,
};
const admin: ActionContext = {
  permissions: perms(
    "applications.read_all",
    "applications.advance_workflow",
    "applications.record_decision",
    "applications.record_disbursement",
    "applications.review_documents",
    "applications.request_information",
  ),
  isOwner: false,
  isAssignee: false,
};
const customer: ActionContext = { permissions: perms("applications.create", "applications.withdraw_own", "applications.read_own"), isOwner: true, isAssignee: false };

describe("state machine", () => {
  it("only allows submitting drafts", () => {
    expect(resolveTarget("submit", { status: "DRAFT", holdPreviousStatus: null })).toBe("SUBMITTED");
    expect(resolveTarget("submit", { status: "SUBMITTED", holdPreviousStatus: null })).toBeNull();
  });

  it("does not let documents-complete jump to approval", () => {
    expect(resolveTarget("complete_documentation", { status: "DOCUMENT_REVIEW", holdPreviousStatus: null })).toBe("READY_FOR_ADMIN_REVIEW");
    expect(resolveTarget("record_lender_approval", { status: "READY_FOR_ADMIN_REVIEW", holdPreviousStatus: null })).toBeNull();
    expect(resolveTarget("record_lender_approval", { status: "DOCUMENT_REVIEW", holdPreviousStatus: null })).toBeNull();
  });

  it("does not let internal approval imply disbursement", () => {
    expect(resolveTarget("record_disbursement", { status: "UNDER_PROCESSING", holdPreviousStatus: null })).toBeNull();
    expect(resolveTarget("record_disbursement", { status: "LENDER_DECISION_PENDING", holdPreviousStatus: null })).toBeNull();
    expect(resolveTarget("record_disbursement", { status: "APPROVED", holdPreviousStatus: null })).toBe("DISBURSED");
  });

  it("resumes on-hold applications to their previous status", () => {
    expect(resolveTarget("resume", { status: "ON_HOLD", holdPreviousStatus: "UNDER_PROCESSING" })).toBe("UNDER_PROCESSING");
    expect(resolveTarget("resume", { status: "ON_HOLD", holdPreviousStatus: null })).toBeNull();
  });

  it("never allows users to trigger system transitions", () => {
    const god: ActionContext = { permissions: new Set(Object.values(TRANSITIONS).map((t) => t.permission ?? "").concat("applications.read_all")), isOwner: true, isAssignee: true };
    expect(isActionPermitted("start_review", { status: "SUBMITTED", holdPreviousStatus: null }, god)).toBe(false);
    expect(isActionPermitted("information_provided", { status: "INFORMATION_REQUIRED", holdPreviousStatus: null }, god)).toBe(false);
  });

  it("terminal statuses have no outgoing user actions except close", () => {
    expect(allowedActions({ status: "CLOSED", holdPreviousStatus: null }, admin)).toEqual([]);
    expect(allowedActions({ status: "DISBURSED", holdPreviousStatus: null }, admin)).toEqual(["close"]);
  });
});

describe("action authorization", () => {
  const review = { status: "DOCUMENT_REVIEW" as const, holdPreviousStatus: null };

  it("assigned loan officer can request information and complete documentation", () => {
    expect(allowedActions(review, officer).sort()).toEqual(["complete_documentation", "request_information"]);
  });

  it("an unassigned loan officer cannot act", () => {
    expect(allowedActions(review, { ...officer, isAssignee: false })).toEqual([]);
  });

  it("loan officer cannot record decisions or disbursements even when assigned", () => {
    expect(isActionPermitted("internal_recommend", { status: "READY_FOR_ADMIN_REVIEW", holdPreviousStatus: null }, officer)).toBe(false);
    expect(isActionPermitted("record_disbursement", { status: "APPROVED", holdPreviousStatus: null }, officer)).toBe(false);
  });

  it("customer can submit and withdraw only their own application", () => {
    expect(isActionPermitted("submit", { status: "DRAFT", holdPreviousStatus: null }, customer)).toBe(true);
    expect(isActionPermitted("withdraw", review, customer)).toBe(true);
    expect(isActionPermitted("withdraw", review, { ...customer, isOwner: false })).toBe(false);
    expect(isActionPermitted("withdraw", { status: "APPROVED", holdPreviousStatus: null }, customer)).toBe(false);
    expect(isActionPermitted("request_information", review, customer)).toBe(false);
  });

  it("admin with read_all can drive later stages", () => {
    expect(allowedActions({ status: "READY_FOR_ADMIN_REVIEW", holdPreviousStatus: null }, admin).sort()).toEqual(
      ["internal_decline", "internal_recommend", "put_on_hold", "return_to_review"].sort(),
    );
    expect(allowedActions({ status: "APPROVED", holdPreviousStatus: null }, admin).sort()).toEqual(["close", "put_on_hold", "record_disbursement"].sort());
  });

  it("requires a reason for sensitive transitions", () => {
    expect(TRANSITIONS.withdraw.requiresReason).toBe(true);
    expect(TRANSITIONS.put_on_hold.requiresReason).toBe(true);
    expect(TRANSITIONS.internal_decline.requiresReason).toBe(true);
  });
});
