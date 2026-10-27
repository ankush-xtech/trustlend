import { InboxIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { countApplicationsByStatus, listApplications } from "@/server/services/applications";
import { EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, PaginationNav, StatCard, sp, spPage } from "@/components/shared/display";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { APPLICATION_STATUSES, STATUS_LABELS } from "@/lib/domain/labels";

export const metadata = { title: "Assigned applications" };

export default async function Page({ searchParams }: PageProps<"/staff">) {
  const actor = await requirePagePermission("staff", "applications.read_assigned");
  const params = await searchParams;
  const [counts, result] = await Promise.all([
    countApplicationsByStatus(actor, "assigned"),
    listApplications(actor, "assigned", { q: sp(params, "q"), status: sp(params, "status"), page: spPage(params), pageSize: 20, sort: "oldest" }),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <>
      <PageHeader
        title="Assigned applications"
        description="Applications currently assigned to you. You can only open applications with an active assignment."
      />
      {sp(params, "handedOff") ? (
        <div className="mb-6 rounded-xl border border-success/30 bg-success/10 p-4 text-sm" role="status">
          Documentation marked complete and handed off for admin review. The application has left your queue.
        </div>
      ) : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Assigned to me" value={total} />
        <StatCard label="In document review" value={counts.DOCUMENT_REVIEW ?? 0} href="/staff?status=DOCUMENT_REVIEW" />
        <StatCard label="Awaiting applicant" value={counts.INFORMATION_REQUIRED ?? 0} href="/staff?status=INFORMATION_REQUIRED" />
      </div>
      <FilterBar basePath="/staff">
        <FilterInput label="Search" name="q" defaultValue={sp(params, "q")} placeholder="Reference or customer" />
        <FilterSelect label="Status" name="status" defaultValue={sp(params, "status")} options={APPLICATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
      </FilterBar>
      {result.rows.length ? (
        <>
          <ApplicationsTable rows={result.rows} hrefBase="/staff/applications" variant="staff" />
          <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/staff" searchParams={params} />
        </>
      ) : (
        <EmptyState icon={<InboxIcon />} title="Nothing assigned" description="When an administrator assigns an application to you, it will appear here and you'll be notified." />
      )}
    </>
  );
}
