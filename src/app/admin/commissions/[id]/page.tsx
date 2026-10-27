import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getCommissionDetail } from "@/server/services/commissions";
import {
  adjustCommissionAction,
  approveCommissionAction,
  cancelCommissionAction,
  flagCommissionAction,
  recordPaymentAction,
} from "@/server/actions/admin";
import { CommissionBadge, DescriptionList, PageHeader, Section } from "@/components/shared/display";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/shared/form-controls";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { formatDate, formatDateTime, formatMoney, todayIso } from "@/lib/format";
import { isUuid, orNotFound } from "@/components/admin/server-utils";

export const metadata = { title: "Commission" };

function detailRows(details: Record<string, unknown>) {
  const labels: Record<string, string> = {
    method: "Method",
    base: "Base",
    baseDefinition: "Base definition",
    ratePercent: "Rate (%)",
    fixedAmount: "Fixed amount",
    uncappedAmount: "Uncapped amount",
    capApplied: "Cap applied",
    capAmount: "Cap",
    rounding: "Rounding",
    ruleName: "Rule",
    reason: "Reason",
  };
  return Object.entries(labels)
    .filter(([k]) => details[k] !== undefined && details[k] !== null)
    .map(([k, label]) => ({ label, value: typeof details[k] === "boolean" ? (details[k] ? "Yes" : "No") : String(details[k]) }));
}

export default async function CommissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("admin", "commissions.read_all");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await orNotFound(getCommissionDetail(actor, id));
  const c = d.commission;
  const own = !!actor.agentId && actor.agentId === c.agentId;
  const p = actor.permissions;
  const canApprove = !own && p.has("commissions.approve") && ["PENDING_VERIFICATION", "ADJUSTMENT_REQUIRED"].includes(c.status) && Number(c.payableAmount) > 0;
  const canFlag = !own && p.has("commissions.approve") && ["PENDING_VERIFICATION", "APPROVED"].includes(c.status);
  const canCancel = !own && p.has("commissions.approve") && !["PAID", "CANCELLED"].includes(c.status);
  const canAdjust = !own && p.has("commissions.adjust") && !["PAID", "CANCELLED"].includes(c.status);
  const canPay = !own && p.has("commissions.mark_paid") && c.status === "APPROVED";
  const details = (c.calculationDetails ?? {}) as Record<string, unknown>;
  const slab = details.slab as { minAmount: string; maxAmount: string | null; ratePercent?: string | null; fixedAmount?: string | null } | undefined;

  return (
    <>
      <PageHeader
        title={`Commission · ${d.reference}`}
        breadcrumb={{ href: "/admin/commissions", label: "Commissions" }}
        description={`${d.agentName} (${d.agentCode}) · ${d.productName} · ${d.customerName}`}
        actions={
          <>
            <CommissionBadge status={c.status} />
            {canApprove ? (
              <ConfirmAction
                action={approveCommissionAction}
                trigger="Approve"
                triggerVariant="default"
                title={`Approve ${formatMoney(c.payableAmount)}?`}
                description="Approval marks the commission payable. Payment must still be recorded with an external payment reference."
                fields={{ commissionId: c.id, version: String(c.version) }}
                reason={{ label: "Approval notes (optional)" }}
                confirmLabel="Approve commission"
              />
            ) : null}
            {canFlag ? (
              <ConfirmAction action={flagCommissionAction} trigger="Flag for adjustment" title="Flag for adjustment?" fields={{ commissionId: c.id }} reason={{ label: "What needs adjusting?", required: true }} confirmLabel="Flag" />
            ) : null}
            {canCancel ? (
              <ConfirmAction
                action={cancelCommissionAction}
                trigger="Cancel"
                triggerVariant="destructive"
                destructive
                title="Cancel this commission?"
                description="The record is retained for audit and can no longer be approved or paid."
                fields={{ commissionId: c.id }}
                reason={{ label: "Reason", required: true }}
                confirmLabel="Cancel commission"
              />
            ) : null}
          </>
        }
      />
      {own ? (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">This is your own commission. You cannot approve, adjust, cancel or record payment for it.</p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Summary">
          <DescriptionList
            items={[
              {
                label: "Application",
                value: p.has("applications.read_all") ? <Link href={`/admin/applications/${c.applicationId}`} className="text-primary hover:underline">{d.reference}</Link> : d.reference,
              },
              { label: "Base (confirmed disbursed principal)", value: formatMoney(c.baseAmount) },
              { label: "Calculated amount", value: formatMoney(c.calculatedAmount) },
              { label: "Payable amount", value: <span className="font-semibold">{formatMoney(c.payableAmount)}</span> },
              { label: "Created", value: formatDateTime(c.createdAt) },
              { label: "Approved", value: c.approvedAt ? formatDateTime(c.approvedAt) : "—" },
              ...(c.cancellationReason ? [{ label: "Cancellation reason", value: c.cancellationReason }] : []),
            ]}
          />
        </Section>
        <Section title="Calculation">
          <DescriptionList items={detailRows(details)} />
          {slab ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Slab applied: {formatMoney(slab.minAmount)} (incl.) – {slab.maxAmount ? `${formatMoney(slab.maxAmount)} (excl.)` : "no limit"} at{" "}
              {slab.ratePercent ? `${slab.ratePercent}%` : formatMoney(slab.fixedAmount ?? "0")}
            </p>
          ) : null}
          {c.ruleSnapshot ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-primary">Rule snapshot at calculation time</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(c.ruleSnapshot, null, 2)}</pre>
            </details>
          ) : null}
        </Section>

        <Section title="Adjustments" className="lg:col-span-2">
          {d.adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adjustments.</p>
          ) : (
            <ul className="mb-4 divide-y">
              {d.adjustments.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{formatMoney(a.amount)}</span> — {a.reason}
                  </span>
                  <span className="text-xs text-muted-foreground">{a.byName} · {formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {canAdjust ? (
            <ActionForm action={adjustCommissionAction} className="grid max-w-2xl gap-3 sm:grid-cols-3" resetOnSuccess>
              <input type="hidden" name="commissionId" value={c.id} />
              <TextField label="Amount (₹)" name="amount" inputMode="decimal" required hint="Negative for deductions" />
              <TextField label="Reason" name="reason" required className="sm:col-span-2" />
              <div className="sm:col-span-3">
                <SubmitButton variant="outline">Record adjustment</SubmitButton>
                <p className="mt-1 text-xs text-muted-foreground">Any adjustment returns the commission to pending verification for re-approval.</p>
              </div>
            </ActionForm>
          ) : null}
        </Section>

        <Section title="Payment" className="lg:col-span-2">
          {d.payment ? (
            <DescriptionList
              columns={3}
              items={[
                { label: "Amount", value: formatMoney(d.payment.amount) },
                { label: "Paid on", value: formatDate(d.payment.paidOn) },
                { label: "Reference", value: d.payment.paymentReference },
                { label: "Method", value: d.payment.paymentMethod.replace(/_/g, " ").toLowerCase() },
                { label: "Notes", value: d.payment.notes ?? "—" },
                { label: "Recorded", value: formatDateTime(d.payment.createdAt) },
              ]}
            />
          ) : canPay ? (
            <ActionForm action={recordPaymentAction} className="grid max-w-3xl gap-3 sm:grid-cols-2">
              <input type="hidden" name="commissionId" value={c.id} />
              <TextField label="Amount (₹)" name="amount" defaultValue={c.payableAmount} inputMode="decimal" required hint="Must equal the approved payable amount" />
              <TextField label="Payment reference" name="paymentReference" required hint="Bank UTR / payout reference" />
              <SelectField
                label="Method"
                name="paymentMethod"
                required
                options={[
                  { value: "BANK_TRANSFER", label: "Bank transfer" },
                  { value: "UPI", label: "UPI" },
                  { value: "CHEQUE", label: "Cheque" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
              <TextField label="Paid on" name="paidOn" type="date" defaultValue={todayIso()} max={todayIso()} required />
              <TextAreaField label="Notes" name="notes" rows={2} className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              {c.status === "APPROVED" ? "You do not have permission to record payments." : "Payment can be recorded once the commission is approved."}
            </p>
          )}
        </Section>
      </div>
    </>
  );
}
