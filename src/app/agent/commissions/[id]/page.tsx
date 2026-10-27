import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getCommissionDetail } from "@/server/services/commissions";
import { NotFoundError } from "@/server/errors";
import { CommissionBadge, DescriptionList, PageHeader, Section } from "@/components/shared/display";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

export const metadata = { title: "Commission" };

export default async function Page({ params }: PageProps<"/agent/commissions/[id]">) {
  const actor = await requirePagePermission("agent", "commissions.read_own");
  const { id } = await params;
  const data = await getCommissionDetail(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const c = data.commission;
  const details = c.calculationDetails as { ratePercent?: string; fixedAmount?: string; capApplied?: boolean; reason?: string };
  const calculation = details.reason
    ? details.reason
    : `${details.ratePercent ? `${details.ratePercent}% of base` : `Fixed ${formatMoney(details.fixedAmount ?? null)}`}${details.capApplied ? " (capped)" : ""}`;
  return (
    <>
      <PageHeader title={`Commission · ${data.reference}`} breadcrumb={{ href: "/agent/commissions", label: "Commissions" }} actions={<CommissionBadge status={c.status} />} />
      <div className="grid gap-6">
        <Section title="Summary">
          <DescriptionList
            items={[
              { label: "Application", value: data.reference },
              { label: "Product", value: data.productName },
              { label: "Customer", value: data.customerName },
              { label: "Commission base (confirmed disbursed principal)", value: formatMoney(c.baseAmount) },
              { label: "Calculated commission", value: formatMoney(c.calculatedAmount) },
              { label: "Payable amount", value: formatMoney(c.payableAmount) },
              { label: "Calculation", value: calculation },
              { label: "Created", value: formatDateTime(c.createdAt) },
              { label: "Approved", value: c.approvedAt ? formatDateTime(c.approvedAt) : "—" },
            ]}
          />
        </Section>
        <Section title="Transaction history">
          <ul className="grid gap-2 text-sm">
            <li className="rounded-lg border p-3">
              Commission calculated · {formatMoney(c.calculatedAmount)} · {formatDateTime(c.createdAt)}
            </li>
            {data.adjustments.map((a) => (
              <li key={a.id} className="rounded-lg border p-3">
                Adjustment {Number(a.amount) >= 0 ? "+" : ""}
                {formatMoney(a.amount)} · {a.reason} · {formatDateTime(a.createdAt)}
              </li>
            ))}
            {c.approvedAt ? <li className="rounded-lg border p-3">Approved for payment · {formatDateTime(c.approvedAt)}</li> : null}
            {data.payment ? (
              <li className="rounded-lg border border-success/30 bg-success/5 p-3">
                Paid {formatMoney(data.payment.amount)} on {formatDate(data.payment.paidOn)} · reference {data.payment.paymentReference}
              </li>
            ) : null}
            {c.status === "CANCELLED" ? <li className="rounded-lg border p-3">Cancelled · {c.cancellationReason}</li> : null}
          </ul>
        </Section>
      </div>
    </>
  );
}
