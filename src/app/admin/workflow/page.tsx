import Link from "next/link";
import { requirePagePermission } from "@/server/auth/current";
import { countApplicationsByStatus } from "@/server/services/applications";
import { PageHeader, Section, StatusBadge } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TRANSITIONS, type WorkflowAction } from "@/lib/domain/workflow";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatusValue } from "@/lib/domain/labels";

export const metadata = { title: "Workflow" };

const SCOPE_LABEL = { owner: "Applicant (customer / creating agent)", staff: "Assigned staff or all-access reviewer", system: "Automatic (system)" } as const;

export default async function Page() {
  const actor = await requirePagePermission("admin", "applications.read_all");
  const counts = await countApplicationsByStatus(actor, "all");
  return (
    <>
      <PageHeader
        title="Workflow & status management"
        description="Applications move only through the transitions below. Every transition checks the actor's permission, record access and preconditions, and is written to the status history and audit log."
      />
      <div className="grid gap-6">
        <Section title="Applications by status">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {APPLICATION_STATUSES.map((s) => (
              <Link key={s} href={`/admin/applications?status=${s}`} className="flex items-center justify-between gap-2 rounded-lg border p-3 hover:bg-muted">
                <StatusBadge status={s} />
                <span className="font-semibold tabular-nums">{counts[s] ?? 0}</span>
              </Link>
            ))}
          </div>
        </Section>
        <Section title="Allowed transitions" description="Preconditions (e.g. all required documents verified before hand-off, a recorded lender approval before disbursement) are enforced by the workflow service.">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead>Who</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.entries(TRANSITIONS) as [WorkflowAction, (typeof TRANSITIONS)[WorkflowAction]][]).map(([key, t]) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium">
                      {t.label}
                      {t.requiresReason ? <span className="block text-xs text-muted-foreground">Reason required</span> : null}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs">{t.from.map((s) => STATUS_LABELS[s]).join(", ")}</TableCell>
                    <TableCell className="text-xs">{t.to === "HOLD_PREVIOUS" ? "Status before hold" : STATUS_LABELS[t.to as ApplicationStatusValue]}</TableCell>
                    <TableCell className="font-mono text-xs">{t.permission ?? "—"}</TableCell>
                    <TableCell className="text-xs">{SCOPE_LABEL[t.scope]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </div>
    </>
  );
}
