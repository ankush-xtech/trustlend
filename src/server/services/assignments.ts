import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { applicationAssignments, loanApplications, permissions, rolePermissions, roles, userRoles, users } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/server/errors";
import { templates } from "@/server/email/templates";
import { reasonSchema } from "@/lib/validation/common";
import { recordAudit } from "./audit";
import { loadApplication } from "./application-access";
import { applyTransition } from "./workflow";
import { appUrl, notifyUser, scheduleDispatch } from "./notifications";

export const assignSchema = z.object({
  assigneeId: z.uuid("Select a staff member"),
  stage: z.enum(["DOCUMENT_REVIEW", "PROCESSING"]).default("DOCUMENT_REVIEW"),
  notes: z.string().trim().max(1000).optional(),
});

const ASSIGNABLE_STATUSES = ["SUBMITTED", "DOCUMENT_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_ADMIN_REVIEW", "UNDER_PROCESSING", "SUBMITTED_TO_LENDER", "LENDER_DECISION_PENDING", "APPROVED", "ON_HOLD"];

async function userCanWorkAssignments(userId: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.isActive, true)))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(users.id, userId), eq(users.status, "ACTIVE"), eq(permissions.key, "applications.update_assigned")))
    .limit(1);
  return !!row;
}

/**
 * Assigns (or reassigns) an application to a staff member. Assignment never changes referral attribution.
 * A SUBMITTED application moves into DOCUMENT_REVIEW when first assigned.
 * Designed so rule/workload-based assignment can call this same function with a system-chosen assignee.
 */
export async function assignApplication(actor: Actor, applicationId: string, input: unknown) {
  requirePermission(actor, "applications.assign");
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const { assigneeId, stage, notes } = parsed.data;
  if (!(await userCanWorkAssignments(assigneeId))) {
    throw new ValidationError(undefined, { assigneeId: ["This user cannot be assigned applications (inactive or missing permission)"] });
  }
  await db.transaction(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    if (!ASSIGNABLE_STATUSES.includes(loaded.app.status)) throw new BusinessRuleError("This application cannot be assigned in its current status.");
    if (loaded.facts.activeAssigneeId === assigneeId) throw new BusinessRuleError("The application is already assigned to this person.");
    const ended = await tx
      .update(applicationAssignments)
      .set({ status: "REASSIGNED", endedAt: new Date() })
      .where(and(eq(applicationAssignments.applicationId, applicationId), eq(applicationAssignments.status, "ACTIVE")))
      .returning({ assigneeId: applicationAssignments.assigneeId });
    const [assignment] = await tx
      .insert(applicationAssignments)
      .values({ applicationId, assigneeId, assignedById: actor.userId, stage, notes: notes ?? null })
      .returning({ id: applicationAssignments.id });
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: ended.length ? "application.reassigned" : "application.assigned",
      entityType: "loan_application",
      entityId: applicationId,
      before: ended.length ? { assigneeId: ended[0].assigneeId } : null,
      after: { assigneeId, stage, referringAgentId: loaded.app.referringAgentId },
      reason: notes ?? null,
    });
    loaded.facts.activeAssigneeId = assigneeId;
    if (loaded.app.status === "SUBMITTED") {
      await applyTransition(tx, loaded, "start_review", null, { reason: "Assigned for document review" });
    }
    const [assignee] = await tx.select({ name: users.name }).from(users).where(eq(users.id, assigneeId)).limit(1);
    await notifyUser(tx, assigneeId, {
      template: "application_assigned",
      email: templates.applicationAssigned({ name: assignee.name, reference: loaded.app.reference, url: appUrl(`/staff/applications/${applicationId}`) }),
      linkPath: `/staff/applications/${applicationId}`,
      entityType: "loan_application",
      entityId: applicationId,
      dedupeKey: `assigned:${assignment.id}`,
    });
  });
  scheduleDispatch();
}

export async function releaseAssignment(actor: Actor, applicationId: string, reasonInput: unknown) {
  requirePermission(actor, "applications.assign");
  const reason = reasonSchema.safeParse(reasonInput);
  if (!reason.success) throw new ValidationError(undefined, { reason: [reason.error.issues[0].message] });
  await db.transaction(async (tx) => {
    const loaded = await loadApplication(tx, applicationId, { lock: true });
    if (!loaded.facts.activeAssigneeId) throw new BusinessRuleError("The application has no active assignment.");
    await tx
      .update(applicationAssignments)
      .set({ status: "RELEASED", endedAt: new Date() })
      .where(and(eq(applicationAssignments.applicationId, applicationId), eq(applicationAssignments.status, "ACTIVE")));
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "application.assignment_released",
      entityType: "loan_application",
      entityId: applicationId,
      before: { assigneeId: loaded.facts.activeAssigneeId },
      reason: reason.data,
    });
  });
}

/** Assignment history across the actor's own assignments (staff workspace). */
export async function listMyAssignmentHistory(actor: Actor, limit = 100) {
  requirePermission(actor, "applications.read_assigned");
  return db
    .select({
      id: applicationAssignments.id,
      applicationId: applicationAssignments.applicationId,
      reference: loanApplications.reference,
      status: applicationAssignments.status,
      stage: applicationAssignments.stage,
      assignedAt: applicationAssignments.assignedAt,
      endedAt: applicationAssignments.endedAt,
      applicationStatus: loanApplications.status,
      assignedByName: sql<string | null>`(select name from users where id = ${applicationAssignments.assignedById})`,
    })
    .from(applicationAssignments)
    .innerJoin(loanApplications, eq(loanApplications.id, applicationAssignments.applicationId))
    .where(eq(applicationAssignments.assigneeId, actor.userId))
    .orderBy(desc(applicationAssignments.assignedAt))
    .limit(limit);
}

export async function getAssignment(applicationId: string) {
  const [a] = await db
    .select()
    .from(applicationAssignments)
    .where(and(eq(applicationAssignments.applicationId, applicationId), eq(applicationAssignments.status, "ACTIVE")))
    .limit(1);
  if (!a) throw new NotFoundError();
  return a;
}
