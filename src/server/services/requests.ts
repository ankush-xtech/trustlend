import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import { applicationDocuments, customers, informationRequests, loanApplications, users } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";

/** Information requests across the actor's applications (customer: own; staff: actively assigned). */
export async function listRequestsForActor(actor: Actor, scope: "own" | "assigned", status: "OPEN" | "ALL" = "OPEN") {
  const scopeCond =
    scope === "own"
      ? (requirePermission(actor, "applications.read_own"), eq(customers.userId, actor.userId))
      : (requirePermission(actor, "applications.read_assigned"),
        sql`exists (select 1 from application_assignments aa where aa.application_id = ${qcol(loanApplications.id)} and aa.assignee_id = ${actor.userId} and aa.status = 'ACTIVE')`);
  return db
    .select({
      id: informationRequests.id,
      applicationId: loanApplications.id,
      reference: loanApplications.reference,
      customerName: customers.fullName,
      message: informationRequests.message,
      status: informationRequests.status,
      createdAt: informationRequests.createdAt,
      respondedAt: informationRequests.respondedAt,
      requestedBy: users.name,
    })
    .from(informationRequests)
    .innerJoin(loanApplications, eq(loanApplications.id, informationRequests.applicationId))
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .innerJoin(users, eq(users.id, informationRequests.requestedById))
    .where(and(scopeCond, status === "OPEN" ? inArray(informationRequests.status, ["OPEN", "RESPONDED"]) : sql`true`))
    .orderBy(desc(informationRequests.createdAt))
    .limit(200);
}

/** Pending documents across applications in review (admin document queue). */
export async function listPendingDocumentQueue(actor: Actor) {
  requirePermission(actor, "applications.review_documents");
  requirePermission(actor, "applications.read_all");
  return db
    .select({
      applicationId: loanApplications.id,
      reference: loanApplications.reference,
      status: loanApplications.status,
      customerName: customers.fullName,
      pending: sql<number>`count(*)::int`,
      oldest: sql<Date>`min(${applicationDocuments.uploadedAt})`,
      assigneeName: sql<string | null>`(select u.name from application_assignments aa join users u on u.id = aa.assignee_id where aa.application_id = ${qcol(loanApplications.id)} and aa.status = 'ACTIVE' limit 1)`,
    })
    .from(applicationDocuments)
    .innerJoin(loanApplications, eq(loanApplications.id, applicationDocuments.applicationId))
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .where(and(eq(applicationDocuments.status, "PENDING_REVIEW"), inArray(loanApplications.status, ["DOCUMENT_REVIEW", "INFORMATION_REQUIRED", "SUBMITTED"])))
    .groupBy(loanApplications.id, loanApplications.reference, loanApplications.status, customers.fullName)
    .orderBy(sql`min(${applicationDocuments.uploadedAt}) asc`)
    .limit(200);
}

/** Unassigned submitted applications and current staff workload (assignment management). */
export async function getAssignmentOverview(actor: Actor) {
  requirePermission(actor, "applications.assign");
  const unassigned = await db
    .select({
      id: loanApplications.id,
      reference: loanApplications.reference,
      status: loanApplications.status,
      customerName: customers.fullName,
      submittedAt: loanApplications.submittedAt,
      acquisitionSource: loanApplications.acquisitionSource,
    })
    .from(loanApplications)
    .innerJoin(customers, eq(customers.id, loanApplications.customerId))
    .where(
      and(
        inArray(loanApplications.status, ["SUBMITTED", "DOCUMENT_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_ADMIN_REVIEW", "UNDER_PROCESSING", "SUBMITTED_TO_LENDER", "LENDER_DECISION_PENDING", "APPROVED"]),
        sql`not exists (select 1 from application_assignments aa where aa.application_id = ${qcol(loanApplications.id)} and aa.status = 'ACTIVE')`,
      ),
    )
    .orderBy(loanApplications.submittedAt)
    .limit(200);
  const workload = await db.execute<{ id: string; name: string; email: string; active: number; completed_30d: number }>(sql`
    select u.id, u.name, u.email,
      count(aa.id) filter (where aa.status = 'ACTIVE')::int as active,
      count(aa.id) filter (where aa.status = 'COMPLETED' and aa.ended_at > now() - interval '30 days')::int as completed_30d
    from users u
    join user_roles ur on ur.user_id = u.id
    join roles r on r.id = ur.role_id and r.is_active
    join role_permissions rp on rp.role_id = r.id
    join permissions p on p.id = rp.permission_id and p.key = 'applications.update_assigned'
    left join application_assignments aa on aa.assignee_id = u.id
    where u.status = 'ACTIVE'
    group by u.id, u.name, u.email
    order by active desc, u.name`);
  return { unassigned, workload: workload.rows.map((w) => ({ ...w, active: Number(w.active), completed_30d: Number(w.completed_30d) })) };
}
