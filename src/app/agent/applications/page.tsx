import { FileTextIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listApplications } from "@/server/services/applications";
import { listActiveProducts } from "@/server/services/products";
import { EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, PaginationNav, sp, spPage } from "@/components/shared/display";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { APPLICATION_STATUSES, STATUS_LABELS } from "@/lib/domain/labels";

export const metadata = { title: "Referred applications" };

export default async function Page({ searchParams }: PageProps<"/agent/applications">) {
  const actor = await requirePagePermission("agent", "applications.read_referred");
  const params = await searchParams;
  const products = await listActiveProducts();
  const result = await listApplications(actor, "referred", {
    q: sp(params, "q"),
    status: sp(params, "status"),
    productId: sp(params, "productId"),
    page: spPage(params),
    pageSize: 20,
    sort: "updated",
  });
  return (
    <>
      <PageHeader title="Referred applications" description="Applications attributed to you. Assignment to TrustLend staff never changes attribution." />
      <FilterBar basePath="/agent/applications">
        <FilterInput label="Search" name="q" defaultValue={sp(params, "q")} placeholder="Reference or customer" />
        <FilterSelect label="Status" name="status" defaultValue={sp(params, "status")} options={APPLICATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
        <FilterSelect label="Product" name="productId" defaultValue={sp(params, "productId")} options={products.map((p) => ({ value: p.id, label: p.name }))} />
      </FilterBar>
      {result.rows.length ? (
        <>
          <ApplicationsTable rows={result.rows} hrefBase="/agent/applications" variant="agent" />
          <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/agent/applications" searchParams={params} />
        </>
      ) : (
        <EmptyState icon={<FileTextIcon />} title="No applications found" description="Applications you start for referred customers will appear here." />
      )}
    </>
  );
}
