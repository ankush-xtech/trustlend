import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listReferralsForReview } from "@/server/services/referrals";
import { reviewReferralAction } from "@/server/actions/admin";
import { EmptyState, PageHeader } from "@/components/shared/display";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Referral reviews" };

export default async function ReferralReviewsPage() {
  const actor = await requirePagePermission("admin", "referrals.review");
  const rows = await listReferralsForReview(actor);
  return (
    <>
      <PageHeader
        title="Referral reviews"
        description="Referrals that matched an existing customer are never attributed automatically. Approving makes the agent the customer's active referrer for FUTURE applications only (superseding any current referral). To change attribution on an existing application, use “Change attribution” on that application (requires applications.change_attribution)."
      />
      {rows.length === 0 ? (
        <EmptyState icon={<ShieldCheckIcon />} title="No referrals awaiting review" description="Duplicate or disputed referrals will appear here." />
      ) : (
        <ul className="grid gap-4">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="font-semibold">{r.agentName}</span> <span className="text-muted-foreground">({r.agentCode})</span> referred{" "}
                    {actor.permissions.has("customers.read_all") ? (
                      <Link href={`/admin/customers/${r.customerId}`} className="font-semibold hover:underline">{r.customerName}</Link>
                    ) : (
                      <span className="font-semibold">{r.customerName}</span>
                    )}{" "}
                    <span className="text-muted-foreground">({r.customerEmail})</span>
                  </p>
                  <p className="text-muted-foreground">
                    Submitted {formatDateTime(r.createdAt)} · Current active referrer: {r.currentAgent ?? "none (direct customer)"} · Existing applications: {r.applicationCount}
                  </p>
                  {r.agentNotes ? <p className="whitespace-pre-line rounded-md bg-muted px-2 py-1.5">{r.agentNotes}</p> : null}
                </div>
                <div className="flex gap-2">
                  <ConfirmAction
                    action={reviewReferralAction}
                    trigger="Approve"
                    triggerVariant="default"
                    title="Approve this referral?"
                    description="The agent becomes the customer's active referrer for future applications. Existing applications keep their current attribution."
                    fields={{ referralId: r.id, decision: "APPROVE" }}
                    reason={{ label: "Review notes (audited)", required: true }}
                    confirmLabel="Approve referral"
                  />
                  <ConfirmAction
                    action={reviewReferralAction}
                    trigger="Reject"
                    destructive
                    title="Reject this referral?"
                    fields={{ referralId: r.id, decision: "REJECT" }}
                    reason={{ label: "Review notes (audited)", required: true }}
                    confirmLabel="Reject referral"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
