import { ScrollTextIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listAuditLogs } from "@/server/services/reports";
import { EmptyState, FilterBar, FilterInput, PageHeader, PaginationNav, sp, spPage } from "@/components/shared/display";
import { formatDateTime } from "@/lib/format";
import type { SearchParams } from "@/components/admin/server-utils";

export const metadata = { title: "Audit logs" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePagePermission("admin", "audit_logs.read");
  const params = await searchParams;
  const result = await listAuditLogs(actor, {
    action: sp(params, "action"),
    entityType: sp(params, "entityType"),
    entityId: sp(params, "entityId"),
    q: sp(params, "q"),
    from: sp(params, "from"),
    to: sp(params, "to"),
    page: spPage(params),
    pageSize: 30,
  });
  return (
    <>
      <PageHeader title="Audit logs" description="Append-only record of sensitive actions. Entries cannot be edited or deleted through the application (enforced by a database trigger). Secrets and document contents are never stored." />
      <FilterBar basePath="/admin/audit">
        <FilterInput label="Action contains" name="action" defaultValue={sp(params, "action")} placeholder="e.g. role." />
        <FilterInput label="Entity type" name="entityType" defaultValue={sp(params, "entityType")} placeholder="loan_application" />
        <FilterInput label="Entity ID" name="entityId" defaultValue={sp(params, "entityId")} />
        <FilterInput label="Actor email" name="q" defaultValue={sp(params, "q")} />
        <FilterInput label="From" name="from" type="date" defaultValue={sp(params, "from")} />
        <FilterInput label="To" name="to" type="date" defaultValue={sp(params, "to")} />
      </FilterBar>
      {result.rows.length === 0 ? (
        <EmptyState icon={<ScrollTextIcon />} title="No audit entries match" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {result.rows.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <code className="font-semibold">{r.action}</code>
                  <span className="text-muted-foreground">
                    {" "}
                    · {r.entityType}
                    {r.entityId ? <> · <code className="text-xs">{r.entityId}</code></> : null}
                  </span>
                </span>
                <time className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</time>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {r.actorEmail ? `${r.actorName ?? ""} <${r.actorEmail}>` : "System"}
                {r.ipAddress ? ` · IP ${r.ipAddress}` : ""}
                {r.requestId ? ` · request ${r.requestId}` : ""}
              </div>
              {r.reason ? <p className="mt-1">Reason: {r.reason}</p> : null}
              {r.before || r.after ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-primary">Changes</summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Before</p>
                      <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-2 text-xs">{r.before ? JSON.stringify(r.before, null, 2) : "—"}</pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">After</p>
                      <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-2 text-xs">{r.after ? JSON.stringify(r.after, null, 2) : "—"}</pre>
                    </div>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/audit" searchParams={params} />
    </>
  );
}
