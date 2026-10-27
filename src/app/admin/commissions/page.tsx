import Link from "next/link";
import { requirePagePermission } from "@/server/auth/current";
import { listCommissions, listCommissionStatusTotals } from "@/server/services/commissions";
import { listAgentOptions } from "@/server/services/agents";
import { CommissionBadge, EmptyState, FilterBar, FilterSelect, PageHeader, PaginationNav, StatCard, sp, spPage } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { COMMISSION_STATUS_LABELS } from "@/lib/domain/labels";
import type { SearchParams } from "@/components/admin/server-utils";

export const metadata = { title: "Commissions" };

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePagePermission("admin", "commissions.read_all");
  const params = await searchParams;
  const [result, totals, agents] = await Promise.all([
    listCommissions(actor, "all", { status: sp(params, "status"), agentId: sp(params, "agentId"), page: spPage(params) }),
    listCommissionStatusTotals(actor),
    actor.permissions.has("agents.read_all") ? listAgentOptions(actor) : Promise.resolve([]),
  ]);
  const byStatus = Object.fromEntries(totals.map((t) => [t.status, t]));
  return (
    <>
      <PageHeader
        title="Commissions"
        description="Created automatically, once per application, when a lender-confirmed disbursement is recorded on an agent-referred application. Direct customer applications never generate commission."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["PENDING_VERIFICATION", "ADJUSTMENT_REQUIRED", "APPROVED", "PAID"] as const).map((s) => (
          <StatCard key={s} label={COMMISSION_STATUS_LABELS[s]} value={formatMoney(byStatus[s]?.total ?? "0")} hint={`${byStatus[s]?.n ?? 0} record(s)`} href={`/admin/commissions?status=${s}`} />
        ))}
      </div>
      <FilterBar basePath="/admin/commissions">
        <FilterSelect label="Status" name="status" defaultValue={sp(params, "status")} options={Object.entries(COMMISSION_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
        {agents.length ? <FilterSelect label="Agent" name="agentId" defaultValue={sp(params, "agentId")} options={agents.map((a) => ({ value: a.id, label: a.label }))} /> : null}
      </FilterBar>
      {result.rows.length === 0 ? (
        <EmptyState title="No commission records" description="Commissions appear after a lender-confirmed disbursement is recorded on an agent-referred application." />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Base (disbursed)</TableHead>
                <TableHead className="text-right">Calculated</TableHead>
                <TableHead className="text-right">Payable</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/commissions/${c.id}`} className="font-medium hover:underline">{c.reference}</Link>
                    <div className="text-xs text-muted-foreground">{c.productName} · {c.customerName}</div>
                  </TableCell>
                  <TableCell className="text-sm">{c.agentName} <span className="text-muted-foreground">({c.agentCode})</span></TableCell>
                  <TableCell><CommissionBadge status={c.status} /></TableCell>
                  <TableCell className="text-right">{formatMoney(c.baseAmount)}</TableCell>
                  <TableCell className="text-right">{formatMoney(c.calculatedAmount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(c.payableAmount)}</TableCell>
                  <TableCell>{formatDate(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/commissions" searchParams={params} />
    </>
  );
}
