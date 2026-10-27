import Link from "next/link";
import {
  BanknoteIcon,
  ClipboardListIcon,
  FileTextIcon,
  HandshakeIcon,
  ShieldAlertIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { requirePortal } from "@/server/auth/current";
import { getAdminDashboard } from "@/server/services/reports";
import { visibleNav } from "@/components/layout/nav-config";
import { PageHeader, Section, StatCard } from "@/components/shared/display";
import { BarList } from "@/components/admin/bar-list";
import { formatDateTime, formatMoney } from "@/lib/format";
import { STATUS_LABELS, type ApplicationStatusValue } from "@/lib/domain/labels";

export const metadata = { title: "Admin dashboard" };

const STATUS_CARDS: ApplicationStatusValue[] = [
  "DRAFT",
  "SUBMITTED",
  "DOCUMENT_REVIEW",
  "INFORMATION_REQUIRED",
  "READY_FOR_ADMIN_REVIEW",
  "APPROVED",
  "REJECTED",
  "DISBURSED",
];

export default async function AdminDashboardPage() {
  const actor = await requirePortal("admin");
  if (!actor.permissions.has("reports.read")) {
    const links = visibleNav("admin", actor.permissions).flatMap((g) => g.items).filter((i) => i.href !== "/admin");
    return (
      <>
        <PageHeader title={`Welcome, ${actor.name}`} description="Your role does not include dashboard reporting. Use the links below for the areas you can access." />
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="block rounded-xl border bg-card p-4 text-sm font-medium shadow-xs hover:border-primary/40">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const d = await getAdminDashboard(actor);
  const appsHref = (status?: string) => (actor.permissions.has("applications.read_all") ? `/admin/applications${status ? `?status=${status}` : ""}` : undefined);

  return (
    <>
      <PageHeader title="Dashboard" description="Live figures from the platform database." />
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Total applications" value={d.total} href={appsHref()} icon={<FileTextIcon />} />
          {STATUS_CARDS.map((s) => (
            <StatCard key={s} label={STATUS_LABELS[s]} value={d.byStatus[s] ?? 0} href={appsHref(s)} />
          ))}
          <StatCard label="Unassigned submissions" value={d.unassigned} href={actor.permissions.has("applications.assign") ? "/admin/assignments" : undefined} icon={<UserPlusIcon />} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Active agents" value={d.activeAgents} href={actor.permissions.has("agents.read_all") ? "/admin/agents" : undefined} icon={<HandshakeIcon />} />
          <StatCard label="Active customers" value={d.activeCustomers} hint="With an open or completed application" href={actor.permissions.has("customers.read_all") ? "/admin/customers" : undefined} icon={<UsersIcon />} />
          <StatCard label="Pending referral reviews" value={d.pendingReferrals} href={actor.permissions.has("referrals.review") ? "/admin/referrals" : undefined} icon={<ShieldAlertIcon />} />
          <StatCard label="Open tasks" value={d.openTasks} hint="Across all staff and agents" icon={<ClipboardListIcon />} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Commission total" value={formatMoney(d.commission.total)} hint="Excludes cancelled / not eligible" icon={<BanknoteIcon />} href={actor.permissions.has("commissions.read_all") ? "/admin/commissions" : undefined} />
          <StatCard label="Commission outstanding" value={formatMoney(d.commission.outstanding)} hint="Pending, approved or needing adjustment" />
          <StatCard label="Pending verification" value={formatMoney(d.commission.pending_verification)} href={actor.permissions.has("commissions.read_all") ? "/admin/commissions?status=PENDING_VERIFICATION" : undefined} />
          <StatCard label="Commission paid" value={formatMoney(d.commission.paid)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Applications by product" description="Submitted applications (excludes drafts).">
            <BarList items={d.byProduct.map((p) => ({ label: p.name, value: p.n }))} />
          </Section>
          <Section title="Applications by acquisition source" description="Direct customers vs agent referrals.">
            <BarList
              items={d.bySource.map((s) => ({
                label: s.source === "AGENT_REFERRAL" ? "Agent referral" : "Direct",
                value: s.n,
                href: appsHref() ? `/admin/applications?source=${s.source}` : undefined,
              }))}
            />
          </Section>
        </div>

        {actor.permissions.has("audit_logs.read") ? (
          <Section title="Recent activity" actions={<Link href="/admin/audit" className="text-sm text-primary hover:underline">View audit log</Link>}>
            {d.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {d.recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium">{r.action}</span>
                      <span className="text-muted-foreground"> · {r.entityType}</span>
                      {r.actorEmail ? <span className="text-muted-foreground"> · {r.actorEmail}</span> : <span className="text-muted-foreground"> · system</span>}
                    </span>
                    <time className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}
      </div>
    </>
  );
}
