import "server-only";
import { and, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { auditLogs, users } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";
import { likePattern, pageArgs, paged, type PageParams } from "./pagination";

/** All figures are computed from live database records. */
export async function getAdminDashboard(actor: Actor) {
  requirePermission(actor, "reports.read");
  const statusRows = await db.execute<{ status: string; n: number }>(sql`select status, count(*)::int as n from loan_applications group by status`);
  const byStatus = Object.fromEntries(statusRows.rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  const byProduct = await db.execute<{ name: string; n: number }>(sql`
    select p.name, count(a.id)::int as n from loan_products p left join loan_applications a on a.product_id = p.id and a.status <> 'DRAFT'
    group by p.name order by n desc`);
  const bySource = await db.execute<{ source: string; n: number }>(sql`
    select acquisition_source as source, count(*)::int as n from loan_applications where status <> 'DRAFT' group by acquisition_source`);
  const [counts] = (
    await db.execute<{ agents: number; customers: number; tasks: number; unassigned: number; pending_referrals: number }>(sql`
    select
      (select count(*)::int from agents a join users u on u.id = a.user_id where a.status = 'ACTIVE' and u.status = 'ACTIVE') as agents,
      (select count(*)::int from customers c where exists (select 1 from loan_applications la where la.customer_id = c.id and la.status not in ('WITHDRAWN','CLOSED'))) as customers,
      (select count(*)::int from application_tasks where status = 'OPEN') as tasks,
      (select count(*)::int from loan_applications la where la.status = 'SUBMITTED' and not exists (select 1 from application_assignments aa where aa.application_id = la.id and aa.status = 'ACTIVE')) as unassigned,
      (select count(*)::int from referrals where status = 'PENDING_REVIEW') as pending_referrals`)
  ).rows;
  const [commission] = (
    await db.execute<{ total: string; outstanding: string; paid: string; pending_verification: string }>(sql`
    select
      coalesce(sum(payable_amount) filter (where status not in ('CANCELLED','NOT_ELIGIBLE')),0)::text as total,
      coalesce(sum(payable_amount) filter (where status in ('PENDING_VERIFICATION','APPROVED','ADJUSTMENT_REQUIRED')),0)::text as outstanding,
      coalesce(sum(payable_amount) filter (where status = 'PAID'),0)::text as paid,
      coalesce(sum(payable_amount) filter (where status = 'PENDING_VERIFICATION'),0)::text as pending_verification
    from commission_records`)
  ).rows;
  const recent = await db
    .select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, actorEmail: auditLogs.actorEmail, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);
  return {
    byStatus,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byProduct: byProduct.rows.map((r) => ({ name: r.name, n: Number(r.n) })),
    bySource: bySource.rows.map((r) => ({ source: r.source, n: Number(r.n) })),
    activeAgents: Number(counts.agents),
    activeCustomers: Number(counts.customers),
    openTasks: Number(counts.tasks),
    unassigned: Number(counts.unassigned),
    pendingReferrals: Number(counts.pending_referrals),
    commission,
    recent: actor.permissions.has("audit_logs.read") ? recent : [],
  };
}

export interface ReportRange {
  from?: string;
  to?: string;
}

function rangeSql(column: SQL, r: ReportRange) {
  const parts: SQL[] = [];
  if (r.from && /^\d{4}-\d{2}-\d{2}$/.test(r.from)) parts.push(sql`${column} >= ${r.from}::date`);
  if (r.to && /^\d{4}-\d{2}-\d{2}$/.test(r.to)) parts.push(sql`${column} < (${r.to}::date + 1)`);
  return parts.length ? sql.join(parts, sql` and `) : sql`true`;
}

export type ReportKey =
  | "status"
  | "product"
  | "source"
  | "processing_time"
  | "workload"
  | "missing_documents"
  | "agent_performance"
  | "commission_liability"
  | "commission_payments"
  | "disbursements";

export const REPORTS: Record<ReportKey, { title: string; description: string }> = {
  status: { title: "Applications by status", description: "Count of submitted applications by current status." },
  product: { title: "Applications by loan product", description: "Submitted applications and requested amounts per product." },
  source: { title: "Applications by acquisition source", description: "Direct vs agent-referred applications and outcomes." },
  processing_time: { title: "Processing time", description: "Average and median days from submission to lender decision, per product." },
  workload: { title: "Assigned staff workload", description: "Active assignments and completed reviews per staff member." },
  missing_documents: { title: "Missing-document queue", description: "Applications awaiting applicant information or documents." },
  agent_performance: { title: "Agent referral performance", description: "Referrals, submissions, disbursements and commission per agent." },
  commission_liability: { title: "Commission liability", description: "Outstanding (unpaid) commission by status and agent." },
  commission_payments: { title: "Commission payment history", description: "Recorded commission payments." },
  disbursements: { title: "Disbursement summary", description: "Confirmed disbursements by month and product." },
};

/** Runs a report. Each query is aggregated in SQL and bounded; nothing unbounded is loaded into memory. */
export async function runReport(actor: Actor, key: ReportKey, range: ReportRange = {}): Promise<{ columns: string[]; rows: (string | number | null)[][] }> {
  requirePermission(actor, "reports.read");
  const submittedRange = rangeSql(sql`a.submitted_at`, range);
  switch (key) {
    case "status": {
      const r = await db.execute<{ status: string; n: number }>(sql`
        select a.status, count(*)::int as n from loan_applications a where a.status <> 'DRAFT' and ${submittedRange} group by a.status order by n desc`);
      return { columns: ["Status", "Applications"], rows: r.rows.map((x) => [x.status, Number(x.n)]) };
    }
    case "product": {
      const r = await db.execute<{ name: string; n: number; requested: string; disbursed: number }>(sql`
        select p.name, count(a.id)::int as n, coalesce(sum(a.requested_amount),0)::text as requested,
          count(a.id) filter (where a.status in ('DISBURSED','CLOSED') and exists (select 1 from disbursements d where d.application_id = a.id))::int as disbursed
        from loan_products p left join loan_applications a on a.product_id = p.id and a.status <> 'DRAFT' and ${submittedRange}
        group by p.name order by n desc`);
      return { columns: ["Product", "Applications", "Total requested", "Disbursed"], rows: r.rows.map((x) => [x.name, Number(x.n), x.requested, Number(x.disbursed)]) };
    }
    case "source": {
      const r = await db.execute<{ source: string; n: number; approved: number; rejected: number; disbursed: number }>(sql`
        select a.acquisition_source as source, count(*)::int as n,
          count(*) filter (where a.status = 'APPROVED')::int as approved,
          count(*) filter (where a.status = 'REJECTED')::int as rejected,
          count(*) filter (where exists (select 1 from disbursements d where d.application_id = a.id))::int as disbursed
        from loan_applications a where a.status <> 'DRAFT' and ${submittedRange} group by a.acquisition_source`);
      return { columns: ["Source", "Applications", "Currently approved", "Rejected", "Disbursed"], rows: r.rows.map((x) => [x.source, Number(x.n), Number(x.approved), Number(x.rejected), Number(x.disbursed)]) };
    }
    case "processing_time": {
      const r = await db.execute<{ name: string; n: number; avg_days: string | null; median_days: string | null }>(sql`
        with decided as (
          select a.product_id, extract(epoch from (min(ld.created_at) - a.submitted_at)) / 86400 as days
          from loan_applications a join lender_decisions ld on ld.application_id = a.id
          where a.submitted_at is not null and ${submittedRange} group by a.id
        )
        select p.name, count(d.days)::int as n, round(avg(d.days)::numeric, 1)::text as avg_days,
          round((percentile_cont(0.5) within group (order by d.days))::numeric, 1)::text as median_days
        from loan_products p left join decided d on d.product_id = p.id group by p.name order by p.name`);
      return { columns: ["Product", "Decided applications", "Average days", "Median days"], rows: r.rows.map((x) => [x.name, Number(x.n), x.avg_days, x.median_days]) };
    }
    case "workload": {
      const r = await db.execute<{ name: string; active: number; completed: number; reassigned: number }>(sql`
        select u.name, count(*) filter (where aa.status = 'ACTIVE')::int as active,
          count(*) filter (where aa.status = 'COMPLETED')::int as completed,
          count(*) filter (where aa.status = 'REASSIGNED')::int as reassigned
        from application_assignments aa join users u on u.id = aa.assignee_id
        where ${rangeSql(sql`aa.assigned_at`, range)} group by u.name order by active desc, u.name`);
      return { columns: ["Staff member", "Active", "Completed", "Reassigned"], rows: r.rows.map((x) => [x.name, Number(x.active), Number(x.completed), Number(x.reassigned)]) };
    }
    case "missing_documents": {
      const r = await db.execute<{ reference: string; customer: string; status: string; open_requests: number; rejected_docs: number; oldest_request: Date | null }>(sql`
        select a.reference, c.full_name as customer, a.status,
          (select count(*)::int from information_requests ir where ir.application_id = a.id and ir.status = 'OPEN') as open_requests,
          (select count(*)::int from application_documents d where d.application_id = a.id and d.status = 'REJECTED') as rejected_docs,
          (select min(ir.created_at) from information_requests ir where ir.application_id = a.id and ir.status = 'OPEN') as oldest_request
        from loan_applications a join customers c on c.id = a.customer_id
        where a.status in ('INFORMATION_REQUIRED','DOCUMENT_REVIEW')
          and (exists (select 1 from information_requests ir where ir.application_id = a.id and ir.status = 'OPEN')
               or exists (select 1 from application_documents d where d.application_id = a.id and d.status = 'REJECTED'))
        order by oldest_request asc nulls last limit 500`);
      return {
        columns: ["Reference", "Customer", "Status", "Open requests", "Rejected documents", "Oldest open request"],
        rows: r.rows.map((x) => [x.reference, x.customer, x.status, Number(x.open_requests), Number(x.rejected_docs), x.oldest_request ? new Date(x.oldest_request).toISOString() : null]),
      };
    }
    case "agent_performance": {
      const r = await db.execute<{ agent: string; code: string; referrals: number; submitted: number; disbursed: number; commission_paid: string; commission_outstanding: string }>(sql`
        select u.name as agent, ag.agent_code as code,
          (select count(*)::int from referrals r where r.agent_id = ag.id and r.status = 'ACTIVE') as referrals,
          (select count(*)::int from loan_applications a where a.referring_agent_id = ag.id and a.status <> 'DRAFT' and ${submittedRange}) as submitted,
          (select count(*)::int from loan_applications a join disbursements d on d.application_id = a.id where a.referring_agent_id = ag.id and ${submittedRange}) as disbursed,
          (select coalesce(sum(cr.payable_amount),0)::text from commission_records cr where cr.agent_id = ag.id and cr.status = 'PAID') as commission_paid,
          (select coalesce(sum(cr.payable_amount),0)::text from commission_records cr where cr.agent_id = ag.id and cr.status in ('PENDING_VERIFICATION','APPROVED','ADJUSTMENT_REQUIRED')) as commission_outstanding
        from agents ag join users u on u.id = ag.user_id order by submitted desc, u.name limit 1000`);
      return {
        columns: ["Agent", "Code", "Active referrals", "Submitted applications", "Disbursed", "Commission paid", "Commission outstanding"],
        rows: r.rows.map((x) => [x.agent, x.code, Number(x.referrals), Number(x.submitted), Number(x.disbursed), x.commission_paid, x.commission_outstanding]),
      };
    }
    case "commission_liability": {
      const r = await db.execute<{ agent: string; status: string; n: number; total: string }>(sql`
        select u.name as agent, cr.status, count(*)::int as n, sum(cr.payable_amount)::text as total
        from commission_records cr join agents ag on ag.id = cr.agent_id join users u on u.id = ag.user_id
        where cr.status in ('PENDING_VERIFICATION','APPROVED','ADJUSTMENT_REQUIRED') and ${rangeSql(sql`cr.created_at`, range)}
        group by u.name, cr.status order by u.name, cr.status`);
      return { columns: ["Agent", "Status", "Commissions", "Outstanding amount"], rows: r.rows.map((x) => [x.agent, x.status, Number(x.n), x.total]) };
    }
    case "commission_payments": {
      const r = await db.execute<{ paid_on: string; agent: string; reference: string; amount: string; payment_reference: string; method: string }>(sql`
        select cp.paid_on::text, u.name as agent, a.reference, cp.amount::text, cp.payment_reference, cp.payment_method as method
        from commission_payments cp join commission_records cr on cr.id = cp.commission_id
        join agents ag on ag.id = cr.agent_id join users u on u.id = ag.user_id join loan_applications a on a.id = cr.application_id
        where ${rangeSql(sql`cp.paid_on`, range)} order by cp.paid_on desc limit 2000`);
      return { columns: ["Paid on", "Agent", "Application", "Amount", "Payment reference", "Method"], rows: r.rows.map((x) => [x.paid_on, x.agent, x.reference, x.amount, x.payment_reference, x.method]) };
    }
    case "disbursements": {
      const r = await db.execute<{ month: string; product: string; n: number; total: string }>(sql`
        select to_char(date_trunc('month', d.disbursed_on), 'YYYY-MM') as month, p.name as product, count(*)::int as n, sum(d.amount)::text as total
        from disbursements d join loan_applications a on a.id = d.application_id join loan_products p on p.id = a.product_id
        where ${rangeSql(sql`d.disbursed_on`, range)} group by 1, 2 order by 1 desc, 2 limit 500`);
      return { columns: ["Month", "Product", "Disbursements", "Total disbursed"], rows: r.rows.map((x) => [x.month, x.product, Number(x.n), x.total]) };
    }
  }
}

export { toCsv } from "@/lib/csv";

// ------------------------------------------------------------------ audit log

export async function listAuditLogs(actor: Actor, f: PageParams & { q?: string; action?: string; entityType?: string; entityId?: string; from?: string; to?: string }) {
  requirePermission(actor, "audit_logs.read");
  const { page, pageSize, offset, limit } = pageArgs(f);
  const conds: SQL[] = [];
  if (f.action) conds.push(ilike(auditLogs.action, likePattern(f.action)));
  if (f.entityType) conds.push(eq(auditLogs.entityType, f.entityType));
  if (f.entityId) conds.push(eq(auditLogs.entityId, f.entityId));
  if (f.q) conds.push(ilike(auditLogs.actorEmail, likePattern(f.q)));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(gte(auditLogs.createdAt, new Date(`${f.from}T00:00:00Z`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(lte(auditLogs.createdAt, new Date(`${f.to}T23:59:59Z`)));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorEmail: auditLogs.actorEmail,
      actorName: users.name,
      before: auditLogs.before,
      after: auditLogs.after,
      reason: auditLogs.reason,
      requestId: auditLogs.requestId,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where);
  return paged(rows, total, page, pageSize);
}
