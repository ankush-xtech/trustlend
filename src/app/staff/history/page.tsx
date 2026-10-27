import Link from "next/link";
import { HistoryIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listMyAssignmentHistory } from "@/server/services/assignments";
import { EmptyState, PageHeader, StatusBadge, ToneBadge } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Assignment history" };

const TONE = { ACTIVE: "info", COMPLETED: "success", REASSIGNED: "neutral", RELEASED: "neutral" } as const;
const LABEL = { ACTIVE: "Active", COMPLETED: "Handed off", REASSIGNED: "Reassigned", RELEASED: "Released" } as const;

export default async function Page() {
  const actor = await requirePagePermission("staff", "applications.read_assigned");
  const rows = await listMyAssignmentHistory(actor);
  return (
    <>
      <PageHeader title="Assignment history" description="Applications assigned to you, including completed hand-offs. Only active assignments can be opened." />
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Current status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Ended</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {r.status === "ACTIVE" ? (
                      <Link href={`/staff/applications/${r.applicationId}`} className="text-primary hover:underline">
                        {r.reference}
                      </Link>
                    ) : (
                      r.reference
                    )}
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={TONE[r.status]}>{LABEL[r.status]}</ToneBadge>
                  </TableCell>
                  <TableCell className="text-xs">{r.stage === "DOCUMENT_REVIEW" ? "Document review" : "Processing"}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.applicationStatus} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(r.assignedAt)}
                    {r.assignedByName ? <span className="block">by {r.assignedByName}</span> : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.endedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState icon={<HistoryIcon />} title="No assignments yet" />
      )}
    </>
  );
}
