import Link from "next/link";
import { requirePagePermission } from "@/server/auth/current";
import { getAssignmentOverview } from "@/server/services/requests";
import { listAssignableStaff } from "@/server/services/users";
import { EmptyState, PageHeader, Section, StatusBadge, ToneBadge } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuickAssign } from "@/components/applications/quick-assign";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Assignments" };

export default async function Page() {
  const actor = await requirePagePermission("admin", "applications.assign");
  const [{ unassigned, workload }, staff] = await Promise.all([getAssignmentOverview(actor), listAssignableStaff(actor)]);
  return (
    <>
      <PageHeader
        title="Assignment management"
        description="Assign submitted applications to staff. Assignment is manual today; the assignment service is designed so rule- or workload-based assignment can be added later."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Section title={`Unassigned applications (${unassigned.length})`}>
          {unassigned.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Assign</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unassigned.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/admin/applications/${a.id}`} className="text-primary hover:underline">
                          {a.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{a.customerName}</TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="text-xs">{a.acquisitionSource === "AGENT_REFERRAL" ? "Agent" : "Direct"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(a.submittedAt)}</TableCell>
                      <TableCell>
                        <QuickAssign applicationId={a.id} staff={staff} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState title="All submitted applications are assigned" />
          )}
        </Section>
        <Section title="Staff workload" description="Users holding applications.update_assigned through an active role.">
          {workload.length ? (
            <ul className="divide-y">
              {workload.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0">
                    <Link href={`/admin/applications?assigneeId=${w.id}`} className="font-medium hover:underline">
                      {w.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">{w.email}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ToneBadge tone={w.active > 10 ? "warning" : "info"}>{w.active} active</ToneBadge>
                    <ToneBadge tone="neutral">{w.completed_30d} done (30d)</ToneBadge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No staff can currently receive assignments.</p>
          )}
        </Section>
      </div>
    </>
  );
}
