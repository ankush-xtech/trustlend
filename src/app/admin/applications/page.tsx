import { FileTextIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listApplications } from "@/server/services/applications";
import { listProductsAdmin } from "@/server/services/products";
import { listAssignableStaff } from "@/server/services/users";
import { EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, PaginationNav, sp, spPage } from "@/components/shared/display";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { APPLICATION_STATUSES, STATUS_LABELS } from "@/lib/domain/labels";

export const metadata = { title: "Applications" };

export default async function Page({ searchParams }: PageProps<"/admin/applications">) {
  const actor = await requirePagePermission("admin", "applications.read_all");
  const params = await searchParams;
  const [products, staff] = await Promise.all([
    listProductsAdmin(actor).catch(() => []),
    actor.permissions.has("applications.assign") ? listAssignableStaff(actor) : Promise.resolve([]),
  ]);
  const sort = (sp(params, "sort") ?? "newest") as "newest" | "oldest" | "updated" | "amount_desc" | "amount_asc";
  const result = await listApplications(actor, "all", {
    q: sp(params, "q"),
    status: sp(params, "status"),
    productId: sp(params, "productId"),
    source: sp(params, "source"),
    assigneeId: sp(params, "assigneeId"),
    from: sp(params, "from"),
    to: sp(params, "to"),
    sort,
    page: spPage(params),
    pageSize: 25,
  });
  return (
    <>
      <PageHeader title="Loan applications" description="All applications across products and channels. Drafts are visible but cannot be processed until submitted." />
      <FilterBar basePath="/admin/applications">
        <FilterInput label="Search" name="q" defaultValue={sp(params, "q")} placeholder="Reference or customer" />
        <FilterSelect
          label="Status"
          name="status"
          defaultValue={sp(params, "status")}
          options={[{ value: "OPEN", label: "Open (in pipeline)" }, ...APPLICATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
        />
        <FilterSelect label="Product" name="productId" defaultValue={sp(params, "productId")} options={products.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect
          label="Source"
          name="source"
          defaultValue={sp(params, "source")}
          options={[
            { value: "DIRECT", label: "Direct" },
            { value: "AGENT_REFERRAL", label: "Agent referral" },
          ]}
        />
        {staff.length ? <FilterSelect label="Assignee" name="assigneeId" defaultValue={sp(params, "assigneeId")} options={staff.map((s) => ({ value: s.id, label: s.name }))} /> : null}
        <FilterInput label="Created from" name="from" type="date" defaultValue={sp(params, "from")} />
        <FilterInput label="Created to" name="to" type="date" defaultValue={sp(params, "to")} />
        <FilterSelect
          label="Sort"
          name="sort"
          defaultValue={sp(params, "sort")}
          options={[
            { value: "oldest", label: "Oldest first" },
            { value: "updated", label: "Recently updated" },
            { value: "amount_desc", label: "Amount (high → low)" },
            { value: "amount_asc", label: "Amount (low → high)" },
          ]}
        />
      </FilterBar>
      {result.rows.length ? (
        <>
          <ApplicationsTable rows={result.rows} hrefBase="/admin/applications" variant="admin" />
          <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/applications" searchParams={params} />
        </>
      ) : (
        <EmptyState icon={<FileTextIcon />} title="No applications match" description="Adjust the filters to see more results." />
      )}
    </>
  );
}
