import Link from "next/link";
import { ReceiptIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listCommissionPayments } from "@/server/services/commissions";
import { EmptyState, PageHeader, PaginationNav, spPage } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { SearchParams } from "@/components/admin/server-utils";

export const metadata = { title: "Commission payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePagePermission("admin", "commissions.read_all");
  const params = await searchParams;
  const result = await listCommissionPayments(actor, { page: spPage(params) });
  return (
    <>
      <PageHeader title="Payment records" description="Append-only ledger of commission payments. Each payment carries an external payment reference." />
      {result.rows.length === 0 ? (
        <EmptyState icon={<ReceiptIcon />} title="No payments recorded" />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paid on</TableHead>
                <TableHead>Application</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Recorded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.paidOn)}</TableCell>
                  <TableCell><Link href={`/admin/commissions/${p.commissionId}`} className="font-medium hover:underline">{p.reference}</Link></TableCell>
                  <TableCell className="text-sm">{p.agentName} <span className="text-muted-foreground">({p.agentCode})</span></TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(p.amount)}</TableCell>
                  <TableCell><code className="text-xs">{p.paymentReference}</code></TableCell>
                  <TableCell className="text-sm">{p.paymentMethod.replace(/_/g, " ").toLowerCase()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.recordedByName ?? "—"} · {formatDateTime(p.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/commissions/payments" searchParams={params} />
    </>
  );
}
