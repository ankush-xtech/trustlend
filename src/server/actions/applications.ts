"use server";

/**
 * Application-related Server Actions. SECURITY: each export is a public endpoint; every action resolves
 * the actor from the session and delegates to services, which enforce permissions and record-level access.
 * Ids passed from the client are never trusted for authorization.
 */
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireActor } from "@/server/auth/current";
import { formToObject, runAction, str } from "./run";
import {
  completeDocumentsStep,
  createDraftApplication,
  saveApplicationStep,
  submitApplication,
} from "@/server/services/applications";
import { removeDocument, reviewDocument } from "@/server/services/documents";
import {
  completeDocumentation,
  performSimpleAction,
  recordDisbursement,
  recordInternalReview,
  recordLenderDecision,
  requestInformation,
  resolveInformationRequest,
  respondToInformationRequest,
  submitToLender,
  withdrawApplication,
} from "@/server/services/workflow";
import { assignApplication, releaseAssignment } from "@/server/services/assignments";
import { changeApplicationAttribution } from "@/server/services/referrals";
import { addApplicationNote, createTask, setTaskStatus } from "@/server/services/tasks";

// ------------------------------------------------------------------ applicant side

export async function createDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let target: string | null = null;
  const result = await runAction(async () => {
    const actor = await requireActor();
    const created = await createDraftApplication(actor, { productId: str(formData, "productId"), customerId: str(formData, "customerId") || undefined });
    const base = actor.agentId && str(formData, "customerId") ? "/agent/applications" : "/customer/applications";
    target = `${base}/${created.id}/edit`;
  });
  if (result.status === "success" && target) redirect(target);
  return result;
}

/** Called by the wizard (React Hook Form) with already-structured data; re-validated on the server. */
export async function saveStepAction(applicationId: string, step: 1 | 2 | 3 | 4, expectedVersion: number, data: unknown): Promise<ActionState> {
  return runAction(
    async () => saveApplicationStep(await requireActor(), applicationId, step, { expectedVersion, data }),
    "Progress saved",
    (r) => ({ version: r.version, completedSteps: r.completedSteps }),
  );
}

export async function completeDocumentsStepAction(applicationId: string, expectedVersion: number): Promise<ActionState> {
  return runAction(
    async () => completeDocumentsStep(await requireActor(), applicationId, { expectedVersion }),
    "Documents step complete",
    (r) => ({ version: r.version }),
  );
}

export async function submitApplicationAction(applicationId: string, expectedVersion: number, declarationAccepted: boolean): Promise<ActionState> {
  return runAction(
    async () => submitApplication(await requireActor(), applicationId, { expectedVersion, declarationAccepted }),
    (r) => (r.alreadySubmitted ? `Application ${r.reference} was already submitted.` : `Application ${r.reference} submitted.`),
    (r) => ({ reference: r.reference }),
  );
}

export async function removeDocumentAction(documentId: string): Promise<ActionState> {
  return runAction(async () => removeDocument(await requireActor(), documentId), "Document removed");
}

export async function respondToRequestAction(requestId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => respondToInformationRequest(await requireActor(), requestId, formToObject(formData)), "Response sent. Thank you!");
}

export async function withdrawAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => withdrawApplication(await requireActor(), applicationId, str(formData, "reason")), "Application withdrawn.");
}

// ------------------------------------------------------------------ staff side

export async function reviewDocumentAction(documentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    async () => reviewDocument(await requireActor(), documentId, formToObject(formData)),
    str(formData, "decision") === "VERIFIED" ? "Document verified" : "Document rejected",
  );
}

export async function requestInformationAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    async () =>
      requestInformation(await requireActor(), applicationId, {
        message: str(formData, "message"),
        requestedCategories: formData.getAll("requestedCategories").map(String),
      }),
    "Information requested from the applicant",
  );
}

export async function resolveRequestAction(requestId: string, cancel: boolean): Promise<ActionState> {
  return runAction(async () => resolveInformationRequest(await requireActor(), requestId, cancel), cancel ? "Request cancelled" : "Request resolved");
}

export async function completeDocumentationAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    async () => completeDocumentation(await requireActor(), applicationId, formToObject(formData)),
    "Documentation marked complete and handed off for admin review",
  );
}

export async function simpleWorkflowAction(
  applicationId: string,
  action: "return_to_review" | "lender_acknowledged" | "put_on_hold" | "resume" | "close",
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => performSimpleAction(await requireActor(), applicationId, action, formToObject(formData)), "Application updated");
}

export async function internalReviewAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => recordInternalReview(await requireActor(), applicationId, formToObject(formData)), "Internal review recorded");
}

export async function submitToLenderAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => submitToLender(await requireActor(), applicationId, formToObject(formData)), "Marked as submitted to lender");
}

export async function lenderDecisionAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => recordLenderDecision(await requireActor(), applicationId, formToObject(formData)), "Lender decision recorded");
}

export async function disbursementAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    async () => recordDisbursement(await requireActor(), applicationId, formToObject(formData)),
    (r) =>
      r.commissionId
        ? `Disbursement recorded. Commission ${r.commissionStatus === "NOT_ELIGIBLE" ? "marked not eligible (no matching rule)" : "created for verification"}.`
        : "Disbursement recorded. No agent commission applies (direct application).",
  );
}

export async function addNoteAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => addApplicationNote(await requireActor(), applicationId, formToObject(formData)), "Note added");
}

export async function assignAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => assignApplication(await requireActor(), applicationId, formToObject(formData)), "Application assigned");
}

export async function releaseAssignmentAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => releaseAssignment(await requireActor(), applicationId, str(formData, "reason")), "Assignment released");
}

export async function changeAttributionAction(applicationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => changeApplicationAttribution(await requireActor(), applicationId, formToObject(formData)), "Attribution updated");
}

// ------------------------------------------------------------------ tasks

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => createTask(await requireActor(), formToObject(formData)), "Task created");
}

export async function setTaskStatusAction(taskId: string, status: "DONE" | "OPEN" | "CANCELLED"): Promise<ActionState> {
  return runAction(async () => setTaskStatus(await requireActor(), taskId, status), status === "DONE" ? "Task completed" : "Task updated");
}
