import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, ToneBadge } from "@/components/shared/display";
import { formatDate, formatMoney } from "@/lib/format";

export interface ApplicationRowView {
  id: string;
  reference: string;
  status: string;
  productName: string;
  currency: string;
  customerName: string;
  requestedAmount: string | null;
  acquisitionSource: string;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  agentName: string | null;
  assigneeName: string | null;
  openRequests: number;
}

type Variant = "customer" | "agent" | "staff" | "admin";

export function ApplicationsTable({ rows, hrefBase, variant }: { rows: ApplicationRowView[]; hrefBase: string; variant: Variant }) {
  const internal = variant === "staff" || variant === "admin";
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            {variant !== "customer" ? <TableHead>Customer</TableHead> : null}
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Requested</TableHead>
            <TableHead>Status</TableHead>
            {internal ? <TableHead>Source</TableHead> : null}
            {internal ? <TableHead>Assignee</TableHead> : null}
            <TableHead>{variant === "customer" ? "Last updated" : "Submitted"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs font-medium">
                <Link href={`${hrefBase}/${r.id}`} className="text-primary hover:underline">
                  {r.reference}
                </Link>
              </TableCell>
              {variant !== "customer" ? <TableCell className="max-w-[12rem] truncate">{r.customerName}</TableCell> : null}
              <TableCell>{r.productName}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(r.requestedAmount, r.currency)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={r.status} />
                  {r.openRequests > 0 ? <ToneBadge tone="warning">{r.openRequests} request{r.openRequests > 1 ? "s" : ""}</ToneBadge> : null}
                </div>
              </TableCell>
              {internal ? (
                <TableCell className="text-xs">
                  {r.acquisitionSource === "AGENT_REFERRAL" ? <span title={r.agentName ?? undefined}>Agent{r.agentName ? ` · ${r.agentName}` : ""}</span> : "Direct"}
                </TableCell>
              ) : null}
              {internal ? <TableCell className="text-xs">{r.assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell> : null}
              <TableCell className="text-xs text-muted-foreground">{variant === "customer" ? formatDate(r.updatedAt) : formatDate(r.submittedAt ?? r.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
