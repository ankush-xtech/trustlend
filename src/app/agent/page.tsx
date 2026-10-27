import { FileTextIcon, UsersIcon, WalletIcon } from "lucide-react";
import { requirePortal } from "@/server/auth/current";
import { countApplicationsByStatus, listApplications } from "@/server/services/applications";
import { agentCommissionSummary } from "@/server/services/commissions";
import { listAgentCustomers } from "@/server/services/customers";
import { listMyTasks } from "@/server/services/tasks";
import { getMyAgentProfile } from "@/server/services/agents";
import { EmptyState, LinkButton, PageHeader, Section, StatCard } from "@/components/shared/display";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Agent dashboard" };

export default async function AgentDashboard() {
  const actor = await requirePortal("agent");
  const profile = await getMyAgentProfile(actor);
  if (!profile) {
    return <EmptyState title="Agent profile not found" description="Your account has the agent role but no agent profile. Please contact an administrator." />;
  }
  const canRead = actor.permissions.has("applications.read_referred");
  const [counts, recent, customers, summary, tasks] = await Promise.all([
    canRead ? countApplicationsByStatus(actor, "referred") : Promise.resolve({} as Record<string, number>),
    canRead ? listApplications(actor, "referred", { pageSize: 6, sort: "updated" }) : Promise.resolve(null),
    listAgentCustomers(actor, { pageSize: 1 }),
    actor.permissions.has("commissions.read_own") ? agentCommissionSummary(actor) : Promise.resolve(null),
    actor.permissions.has("tasks.manage_own") ? listMyTasks(actor, "OPEN") : Promise.resolve([]),
  ]);
  const submitted = Object.entries(counts)
    .filter(([s]) => s !== "DRAFT")
    .reduce((a, [, n]) => a + (n ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`Hello, ${actor.name.split(" ")[0]}`}
        description={`Agent code ${profile.agentCode}${profile.status !== "ACTIVE" ? " · Suspended — referrals and new applications are disabled" : ""}`}
        actions={actor.permissions.has("referrals.create") ? <LinkButton href="/agent/refer">Refer a customer</LinkButton> : null}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Referred customers" value={customers.total} icon={<UsersIcon />} href="/agent/customers" />
        <StatCard label="Submitted applications" value={submitted} hint={`${counts.DRAFT ?? 0} drafts`} icon={<FileTextIcon />} href="/agent/applications" />
        <StatCard label="Disbursed" value={counts.DISBURSED ?? 0} href="/agent/applications?status=DISBURSED" />
        {summary ? <StatCard label="Commission paid" value={formatMoney(summary.paid)} hint={`${formatMoney(summary.pending)} pending · ${formatMoney(summary.approved)} approved`} icon={<WalletIcon />} href="/agent/commissions" /> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title="Recent referred applications" actions={<LinkButton href="/agent/applications" variant="ghost" size="sm">View all</LinkButton>}>
          {recent && recent.rows.length ? (
            <ApplicationsTable rows={recent.rows} hrefBase="/agent/applications" variant="agent" />
          ) : (
            <EmptyState title="No referred applications yet" description="Refer a customer, then start an application for them." />
          )}
        </Section>
        <Section title="Follow-ups due" actions={<LinkButton href="/agent/tasks" variant="ghost" size="sm">All tasks</LinkButton>}>
          {tasks.length ? (
            <ul className="grid gap-2 text-sm">
              {tasks.slice(0, 6).map((t) => (
                <li key={t.id} className="rounded-lg border p-3">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.dueAt ? `Due ${formatDate(t.dueAt)}` : "No due date"}
                    {t.customerName ? ` · ${t.customerName}` : ""}
                    {t.reference ? ` · ${t.reference}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No open follow-ups.</p>
          )}
        </Section>
      </div>
    </>
  );
}
