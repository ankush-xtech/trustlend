import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortal } from "@/server/auth/current";
import { getAgentCustomer } from "@/server/services/customers";
import { listActiveProducts } from "@/server/services/products";
import { NotFoundError } from "@/server/errors";
import { DescriptionList, EmptyState, PageHeader, Section, StatusBadge } from "@/components/shared/display";
import { InviteCustomerButton, StartForCustomer } from "@/components/agent/customer-actions";
import { TaskForm } from "@/components/shared/task-form";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Customer" };

export default async function Page({ params }: PageProps<"/agent/customers/[id]">) {
  const actor = await requirePortal("agent");
  const { id } = await params;
  const data = await getAgentCustomer(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const products = await listActiveProducts();
  const c = data.customer;
  return (
    <>
      <PageHeader title={c.fullName} description="Referred customer" breadcrumb={{ href: "/agent/customers", label: "Customers" }} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <Section title="Applications">
            {data.applications.length ? (
              <ul className="divide-y">
                {data.applications.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <Link href={`/agent/applications/${a.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                      {a.reference}
                    </Link>
                    <span className="tabular-nums">{formatMoney(a.requestedAmount)}</span>
                    <StatusBadge status={a.status} />
                    <span className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No applications yet" description="Start an application on the customer's behalf below." />
            )}
            {actor.permissions.has("applications.create") && actor.agentActive ? (
              <div className="mt-4 border-t pt-4">
                <StartForCustomer customerId={c.id} products={products.map((p) => ({ id: p.id, name: p.name }))} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Applications you start are attributed to you. Fill them in with the customer and obtain their consent before submitting.
                </p>
              </div>
            ) : null}
          </Section>
        </div>
        <div className="grid content-start gap-6">
          <Section title="Contact">
            <DescriptionList
              columns={1}
              items={[
                { label: "Email", value: c.email },
                { label: "Mobile", value: c.mobile },
                { label: "Portal account", value: c.hasAccount ? "Yes" : "Not yet" },
                { label: "Customer since", value: formatDate(c.createdAt) },
              ]}
            />
            {!c.hasAccount ? (
              <div className="mt-4">
                <InviteCustomerButton customerId={c.id} />
                <p className="mt-1 text-xs text-muted-foreground">The customer can then track the application and upload documents themselves.</p>
              </div>
            ) : null}
          </Section>
          {actor.permissions.has("tasks.manage_own") ? (
            <Section title="Add a follow-up">
              <TaskForm customerId={c.id} />
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}
