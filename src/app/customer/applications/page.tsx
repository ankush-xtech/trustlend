import { FileTextIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listApplications } from "@/server/services/applications";
import { EmptyState, LinkButton, PageHeader, PaginationNav, sp, spPage } from "@/components/shared/display";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "My applications" };

const TABS = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "OPEN", label: "In progress" },
  { value: "INFORMATION_REQUIRED", label: "Action needed" },
  { value: "APPROVED", label: "Approved" },
  { value: "DISBURSED", label: "Disbursed" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

export default async function Page({ searchParams }: PageProps<"/customer/applications">) {
  const actor = await requirePagePermission("customer", "applications.read_own");
  const params = await searchParams;
  const status = sp(params, "status") ?? "";
  const result = await listApplications(actor, "own", { status: status || undefined, page: spPage(params), pageSize: 15, sort: "updated" });
  return (
    <>
      <PageHeader title="My applications" description="Drafts, submitted applications and their current status." actions={<LinkButton href="/customer/apply">New application</LinkButton>} />
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value ? `/customer/applications?status=${t.value}` : "/customer/applications"}
            aria-current={status === t.value ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", status === t.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {result.rows.length ? (
        <>
          <ApplicationsTable rows={result.rows} hrefBase="/customer/applications" variant="customer" />
          <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/customer/applications" searchParams={params} />
        </>
      ) : (
        <EmptyState icon={<FileTextIcon />} title="No applications found" description={status ? "No applications match this filter." : "You haven't started any applications yet."} action={<LinkButton href="/customer/apply">Start application</LinkButton>} />
      )}
    </>
  );
}
