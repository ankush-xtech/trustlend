import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { requirePortal } from "@/server/auth/current";
import { listAgentCustomers } from "@/server/services/customers";
import { EmptyState, FilterBar, FilterInput, LinkButton, PageHeader, PaginationNav, ToneBadge, sp, spPage } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Customers" };

export default async function Page({ searchParams }: PageProps<"/agent/customers">) {
  const actor = await requirePortal("agent");
  const params = await searchParams;
  const result = await listAgentCustomers(actor, { q: sp(params, "q"), page: spPage(params), pageSize: 20 });
  return (
    <>
      <PageHeader title="Customers" description="Customers you have referred. Only your own referrals are shown." actions={actor.permissions.has("referrals.create") ? <LinkButton href="/agent/refer">Refer a customer</LinkButton> : null} />
      <FilterBar basePath="/agent/customers">
        <FilterInput label="Search" name="q" defaultValue={sp(params, "q")} placeholder="Name or mobile" />
      </FilterBar>
      {result.rows.length ? (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Referral</TableHead>
                  <TableHead>Applications</TableHead>
                  <TableHead>Portal account</TableHead>
                  <TableHead>Referred</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.referralId}>
                    <TableCell className="font-medium">
                      {r.referralStatus === "ACTIVE" ? (
                        <Link href={`/agent/customers/${r.customerId}`} className="text-primary hover:underline">
                          {r.fullName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{r.fullName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.mobile}
                      {r.email ? <span className="block text-muted-foreground">{r.email}</span> : null}
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={r.referralStatus === "ACTIVE" ? "success" : "warning"}>{r.referralStatus === "ACTIVE" ? "Active" : "Under review"}</ToneBadge>
                    </TableCell>
                    <TableCell>{r.applicationCount}</TableCell>
                    <TableCell className="text-xs">{r.hasAccount ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(r.referredAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/agent/customers" searchParams={params} />
        </>
      ) : (
        <EmptyState icon={<UsersIcon />} title="No customers yet" description="Customers you refer will appear here." action={actor.permissions.has("referrals.create") ? <LinkButton href="/agent/refer">Refer a customer</LinkButton> : null} />
      )}
    </>
  );
}
