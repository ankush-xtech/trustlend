import Link from "next/link";
import { AlertTriangleIcon, FilePlus2Icon, FileTextIcon } from "lucide-react";
import { requirePortal } from "@/server/auth/current";
import { countApplicationsByStatus, listApplications } from "@/server/services/applications";
import { listActiveProducts } from "@/server/services/products";
import { env } from "@/server/config/env";
import { EmptyState, LinkButton, PageHeader, Section, StatCard } from "@/components/shared/display";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { formatMoney } from "@/lib/format";
import { CLOSED_STATUSES } from "@/lib/domain/workflow";

export const metadata = { title: "Dashboard" };

export default async function CustomerDashboard() {
  const actor = await requirePortal("customer");
  const [counts, recent, drafts, products] = await Promise.all([
    countApplicationsByStatus(actor, "own"),
    listApplications(actor, "own", { pageSize: 5, sort: "updated" }),
    listApplications(actor, "own", { status: "DRAFT", pageSize: 5, sort: "updated" }),
    listActiveProducts(),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const active = Object.entries(counts).filter(([s]) => s !== "DRAFT" && !(CLOSED_STATUSES as readonly string[]).includes(s)).reduce((a, [, n]) => a + (n ?? 0), 0);
  const actionNeeded = recent.rows.filter((r) => r.openRequests > 0 || r.status === "INFORMATION_REQUIRED");
  const needsVerification = env().REQUIRE_EMAIL_VERIFICATION && !actor.emailVerified;

  return (
    <>
      <PageHeader
        title={`Welcome, ${actor.name.split(" ")[0]}`}
        description="Track your loan applications, respond to requests and manage your documents."
        actions={<LinkButton href="/customer/apply">Start a new application</LinkButton>}
      />
      {needsVerification ? (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm" role="status">
          Please verify your email address using the link we sent you before starting an application.
        </div>
      ) : null}
      {actionNeeded.length ? (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangleIcon className="size-4" aria-hidden /> Action needed
          </p>
          <ul className="mt-2 grid gap-1 text-sm">
            {actionNeeded.map((r) => (
              <li key={r.id}>
                <Link href={`/customer/applications/${r.id}`} className="font-medium underline-offset-2 hover:underline">
                  {r.reference}
                </Link>{" "}
                — we need more information or documents from you.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="All applications" value={total} href="/customer/applications" />
        <StatCard label="In progress" value={active} hint="Submitted and being processed" href="/customer/applications?status=OPEN" />
        <StatCard label="Drafts" value={counts.DRAFT ?? 0} hint="Not yet submitted" href="/customer/applications?status=DRAFT" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title="Recent applications" actions={<LinkButton href="/customer/applications" variant="ghost" size="sm">View all</LinkButton>}>
          {recent.rows.length ? (
            <ApplicationsTable rows={recent.rows} hrefBase="/customer/applications" variant="customer" />
          ) : (
            <EmptyState icon={<FileTextIcon />} title="No applications yet" description="Start an application in a few minutes. You can save and come back any time." action={<LinkButton href="/customer/apply">Start application</LinkButton>} />
          )}
        </Section>
        <div className="grid content-start gap-6">
          {drafts.rows.length ? (
            <Section title="Continue a draft">
              <ul className="grid gap-2">
                {drafts.rows.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                    <span>
                      <span className="block font-mono text-xs">{d.reference}</span>
                      <span className="text-muted-foreground">{d.productName}</span>
                    </span>
                    <LinkButton href={`/customer/applications/${d.id}/edit`} size="sm" variant="outline">
                      Continue
                    </LinkButton>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Section title="Available loan products">
            <ul className="grid gap-3">
              {products.map((p) => (
                <li key={p.id} className="rounded-lg border p-3">
                  <p className="flex items-center gap-2 font-medium">
                    <FilePlus2Icon className="size-4 text-primary" aria-hidden /> {p.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatMoney(p.minAmount, p.currency)} – {formatMoney(p.maxAmount, p.currency)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Product availability does not guarantee eligibility or approval.</p>
          </Section>
        </div>
      </div>
    </>
  );
}
