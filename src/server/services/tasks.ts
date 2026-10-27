import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { applicationNotes, applicationTasks, customers, loanApplications, referrals } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";
import { hasStaffAuthority } from "@/server/rbac/application-access";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "./audit";
import { loadApplication, loadApplicationForView } from "./application-access";

export const taskSchema = z.object({
  title: z.string().trim().min(3, "Enter a title").max(160),
  description: z.string().trim().max(2000).optional(),
  dueAt: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
    .optional()
    .transform((v) => (v ? new Date(`${v}T12:00:00Z`) : null)),
  applicationId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => (v ? v : null)),
  customerId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => (v ? v : null)),
});

/** Personal follow-up tasks. Links to applications/customers are checked against the actor's access. */
export async function createTask(actor: Actor, input: unknown) {
  requirePermission(actor, "tasks.manage_own");
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const data = parsed.data;
  if (data.applicationId) await loadApplicationForView(db, actor, data.applicationId);
  if (data.customerId) {
    const allowed =
      actor.permissions.has("customers.read_all") ||
      (actor.agentId &&
        (
          await db
            .select({ id: referrals.id })
            .from(referrals)
            .where(and(eq(referrals.customerId, data.customerId), eq(referrals.agentId, actor.agentId), eq(referrals.status, "ACTIVE")))
            .limit(1)
        ).length > 0);
    if (!allowed) throw new NotFoundError();
  }
  const [task] = await db
    .insert(applicationTasks)
    .values({
      title: data.title,
      description: data.description ?? null,
      dueAt: data.dueAt,
      applicationId: data.applicationId,
      customerId: data.customerId,
      assigneeId: actor.userId,
      createdById: actor.userId,
    })
    .returning({ id: applicationTasks.id });
  return task.id;
}

export async function listMyTasks(actor: Actor, status: "OPEN" | "DONE" | "ALL" = "OPEN") {
  requirePermission(actor, "tasks.manage_own");
  return db
    .select({
      id: applicationTasks.id,
      title: applicationTasks.title,
      description: applicationTasks.description,
      dueAt: applicationTasks.dueAt,
      status: applicationTasks.status,
      completedAt: applicationTasks.completedAt,
      createdAt: applicationTasks.createdAt,
      applicationId: applicationTasks.applicationId,
      reference: loanApplications.reference,
      customerId: applicationTasks.customerId,
      customerName: customers.fullName,
    })
    .from(applicationTasks)
    .leftJoin(loanApplications, eq(loanApplications.id, applicationTasks.applicationId))
    .leftJoin(customers, eq(customers.id, applicationTasks.customerId))
    .where(and(eq(applicationTasks.assigneeId, actor.userId), status === "ALL" ? sql`true` : eq(applicationTasks.status, status)))
    .orderBy(sql`${applicationTasks.dueAt} asc nulls last`, asc(applicationTasks.createdAt))
    .limit(200);
}

export async function setTaskStatus(actor: Actor, taskId: string, status: "DONE" | "CANCELLED" | "OPEN") {
  requirePermission(actor, "tasks.manage_own");
  const [task] = await db.select().from(applicationTasks).where(eq(applicationTasks.id, taskId)).limit(1);
  if (!task || task.assigneeId !== actor.userId) throw new NotFoundError();
  await db
    .update(applicationTasks)
    .set({ status, completedAt: status === "DONE" ? new Date() : null })
    .where(eq(applicationTasks.id, taskId));
}

export async function countOpenTasks(actor: Actor) {
  if (!actor.permissions.has("tasks.manage_own")) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(applicationTasks)
    .where(and(eq(applicationTasks.assigneeId, actor.userId), eq(applicationTasks.status, "OPEN")));
  return row?.n ?? 0;
}

// ------------------------------------------------------------------ notes

export const noteSchema = z.object({
  body: z.string().trim().min(2, "Write a note").max(4000),
  visibility: z.enum(["INTERNAL", "CUSTOMER_VISIBLE"]).default("INTERNAL"),
});

/** Staff notes. INTERNAL notes are never returned to customers or agents. */
export async function addApplicationNote(actor: Actor, applicationId: string, input: unknown) {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const loaded = await loadApplication(db, applicationId);
  if (!hasStaffAuthority(actor, loaded.facts)) throw new NotFoundError();
  if (loaded.app.status === "DRAFT") throw new BusinessRuleError("Notes can be added after submission.");
  await db.transaction(async (tx) => {
    const [note] = await tx
      .insert(applicationNotes)
      .values({ applicationId, authorId: actor.userId, body: parsed.data.body, visibility: parsed.data.visibility })
      .returning({ id: applicationNotes.id });
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "application.note_added",
      entityType: "loan_application",
      entityId: applicationId,
      after: { noteId: note.id, visibility: parsed.data.visibility },
    });
  });
}
