import Link from "next/link";
import { requirePagePermission } from "@/server/auth/current";
import { listCustomers } from "@/server/services/customers";
import { EmptyState, FilterBar, FilterInput, PageHeader, PaginationNav, sp, spPage } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { SearchParams } from "@/components/admin/server-utils";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePagePermission("admin", "customers.read_all");
  const params = await searchParams;
  const result = await listCustomers(actor, { q: sp(params, "q"), page: spPage(params) });
  return (
    <>
      <PageHeader title="Customers" description="Applicants, whether they registered directly or were referred by an agent." />
      <FilterBar basePath="/admin/customers">
        <FilterInput label="Search" name="q" defaultValue={sp(params, "q")} placeholder="Name, email or mobile" />
      </FilterBar>
      {result.rows.length === 0 ? (
        <EmptyState title="No customers found" />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Portal account</TableHead>
                <TableHead>Referring agent</TableHead>
                <TableHead className="text-right">Applications</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.fullName}</Link>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </TableCell>
                  <TableCell>{c.mobile || "—"}</TableCell>
                  <TableCell>{c.hasAccount ? "Yes" : "No"}</TableCell>
                  <TableCell>{c.referringAgent ?? <span className="text-muted-foreground">Direct</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.applicationCount}</TableCell>
                  <TableCell>{formatDate(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/customers" searchParams={params} />
    </>
  );
}
