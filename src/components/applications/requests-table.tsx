import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToneBadge } from "@/components/shared/display";
import { formatDateTime } from "@/lib/format";

export function RequestsTable({
  rows,
  hrefBase,
  showCustomer,
}: {
  rows: { id: string; applicationId: string; reference: string; customerName: string; message: string; status: string; createdAt: Date; respondedAt: Date | null }[];
  hrefBase: string;
  showCustomer: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Application</TableHead>
            {showCustomer ? <TableHead>Customer</TableHead> : null}
            <TableHead>Request</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requested</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">
                <Link href={`${hrefBase}/${r.applicationId}`} className="text-primary hover:underline">
                  {r.reference}
                </Link>
              </TableCell>
              {showCustomer ? <TableCell>{r.customerName}</TableCell> : null}
              <TableCell className="max-w-md truncate" title={r.message}>
                {r.message}
              </TableCell>
              <TableCell>
                <ToneBadge tone={r.status === "OPEN" ? "warning" : r.status === "RESPONDED" ? "info" : "neutral"}>{r.status === "OPEN" ? "Awaiting response" : r.status === "RESPONDED" ? "Responded" : r.status.toLowerCase()}</ToneBadge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
