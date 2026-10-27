import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getCustomerAdmin } from "@/server/services/customers";
import { inviteCustomerAction, revokeReferralAction, updateCustomerAction } from "@/server/actions/admin";
import { DescriptionList, PageHeader, Section, StatusBadge, ToneBadge } from "@/components/shared/display";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { TextField } from "@/components/shared/form-controls";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { REFERRAL_STATUS_LABELS } from "@/lib/domain/labels";
import { isUuid, orNotFound } from "@/components/admin/server-utils";

export const metadata = { title: "Customer" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("admin", "customers.read_all");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { customer, applications, referrals } = await orNotFound(getCustomerAdmin(actor, id));
  const canManage = actor.permissions.has("customers.manage");
  const canLinkApps = actor.permissions.has("applications.read_all");

  return (
    <>
      <PageHeader
        title={customer.fullName}
        breadcrumb={{ href: "/admin/customers", label: "Customers" }}
        description={customer.email}
        actions={
          canManage && !customer.userId ? (
            <ConfirmAction
              action={inviteCustomerAction}
              trigger="Invite to portal"
              title="Invite this customer to the customer portal?"
              description="The customer receives a single-use link to set a password and track their applications."
              fields={{ customerId: customer.id }}
              confirmLabel="Send invitation"
            />
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profile">
          <DescriptionList
            items={[
              { label: "Mobile", value: customer.mobile || "—" },
              { label: "Date of birth", value: formatDate(customer.dateOfBirth) },
              { label: "Portal account", value: customer.userId ? "Linked" : "None" },
              { label: "Created", value: formatDateTime(customer.createdAt) },
            ]}
          />
        </Section>
        {canManage ? (
          <Section title="Edit customer" description="Email is the identity key for account linking and cannot be edited here.">
            <ActionForm action={updateCustomerAction} className="grid gap-4">
              <input type="hidden" name="customerId" value={customer.id} />
              <TextField label="Full name" name="fullName" defaultValue={customer.fullName} required />
              <TextField label="Mobile" name="mobile" defaultValue={customer.mobile} required inputMode="tel" />
              <TextField label="Date of birth" name="dateOfBirth" type="date" defaultValue={customer.dateOfBirth ?? ""} />
              <div>
                <SubmitButton>Save</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        ) : null}
        <Section title="Applications" className="lg:col-span-2">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{canLinkApps ? <Link href={`/admin/applications/${a.id}`} className="font-medium hover:underline">{a.reference}</Link> : a.reference}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell>{a.acquisitionSource === "AGENT_REFERRAL" ? "Agent referral" : "Direct"}</TableCell>
                    <TableCell className="text-right">{formatMoney(a.requestedAmount)}</TableCell>
                    <TableCell>{formatDate(a.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
        <Section title="Referral history" description="Revoking a referral stops future applications from being attributed; existing applications keep their attribution." className="lg:col-span-2">
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">This customer has no referrals (direct customer).</p>
          ) : (
            <ul className="divide-y">
              {referrals.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{r.agentName}</span> <span className="text-muted-foreground">({r.agentCode}) · {formatDate(r.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ToneBadge tone={r.status === "ACTIVE" ? "success" : r.status === "PENDING_REVIEW" ? "warning" : "neutral"}>{REFERRAL_STATUS_LABELS[r.status] ?? r.status}</ToneBadge>
                    {r.status === "ACTIVE" && actor.permissions.has("referrals.review") ? (
                      <ConfirmAction
                        action={revokeReferralAction}
                        trigger="Revoke"
                        triggerVariant="ghost"
                        destructive
                        title="Revoke this referral?"
                        description="Future applications will no longer be attributed to this agent. Existing applications are unchanged."
                        fields={{ referralId: r.id }}
                        reason={{ label: "Reason", required: true }}
                        confirmLabel="Revoke referral"
                      />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
