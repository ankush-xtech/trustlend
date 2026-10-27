import Link from "next/link";
import { WalletIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { agentCommissionSummary, listCommissions } from "@/server/services/commissions";
import { CommissionBadge, EmptyState, PageHeader, PaginationNav, StatCard, sp, spPage } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Commissions" };

const TABS = [
  { value: "", label: "All history" },
  { value: "PENDING_VERIFICATION", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "PAID", label: "Paid" },
  { value: "ADJUSTMENT_REQUIRED", label: "Adjustment required" },
  { value: "NOT_ELIGIBLE", label: "Not eligible" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function Page({ searchParams }: PageProps<"/agent/commissions">) {
  const actor = await requirePagePermission("agent", "commissions.read_own");
  const params = await searchParams;
  const status = sp(params, "status") ?? "";
  const [summary, list] = await Promise.all([
    agentCommissionSummary(actor),
    listCommissions(actor, "own", { status: status || undefined, page: spPage(params), pageSize: 20 }),
  ]);
  return (
    <>
      <PageHeader
        title="Commissions"
        description="Commission becomes eligible only after the lender confirms disbursement of a loan you referred, and is paid after TrustLend verification and approval."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending verification" value={formatMoney(summary.pending)} href="/agent/commissions?status=PENDING_VERIFICATION" />
        <StatCard label="Approved, awaiting payment" value={formatMoney(summary.approved)} href="/agent/commissions?status=APPROVED" />
        <StatCard label="Paid to date" value={formatMoney(summary.paid)} href="/agent/commissions?status=PAID" />
      </div>
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value ? `/agent/commissions?status=${t.value}` : "/agent/commissions"}
            aria-current={status === t.value ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", status === t.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {list.rows.length ? (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Disbursed base</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/agent/commissions/${r.id}`} className="text-primary hover:underline">
                        {r.reference}
                      </Link>
                    </TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.baseAmount)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.payableAmount)}</TableCell>
                    <TableCell>
                      <CommissionBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.paidOn ? formatDate(r.paidOn) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationNav page={list.page} pageCount={list.pageCount} total={list.total} basePath="/agent/commissions" searchParams={params} />
        </>
      ) : (
        <EmptyState icon={<WalletIcon />} title="No commissions yet" description="Commissions appear here once a referred loan is confirmed as disbursed." />
      )}
    </>
  );
}
