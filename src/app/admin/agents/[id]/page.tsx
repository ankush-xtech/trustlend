import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getAgentAdmin, listAgentApplicationsAdmin } from "@/server/services/agents";
import { listCommissions } from "@/server/services/commissions";
import { setAgentStatusAction, updateAgentAction } from "@/server/actions/admin";
import { CommissionBadge, DescriptionList, PageHeader, Section, StatCard, StatusBadge, ToneBadge } from "@/components/shared/display";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { TextAreaField, TextField } from "@/components/shared/form-controls";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { sumMoney } from "@/lib/domain/commission-calc";
import { isUuid, orNotFound } from "@/components/admin/server-utils";

export const metadata = { title: "Agent" };

export default async function AgentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission("admin", "agents.read_all");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { created } = await searchParams;
  const agent = await orNotFound(getAgentAdmin(actor, id));
  const canManage = actor.permissions.has("agents.manage");
  const apps = actor.permissions.has("applications.read_all") ? (await listAgentApplicationsAdmin(actor, id)).rows : null;
  const commissions = actor.permissions.has("commissions.read_all") ? await listCommissions(actor, "all", { agentId: id, pageSize: 50 }) : null;
  const sumBy = (statuses: string[]) => sumMoney((commissions?.rows ?? []).filter((c) => statuses.includes(c.status)).map((c) => c.payableAmount));

  return (
    <>
      <PageHeader
        title={agent.name}
        breadcrumb={{ href: "/admin/agents", label: "Agents" }}
        description={`${agent.agentCode} · ${agent.email}`}
        actions={
          <>
            <ToneBadge tone={agent.status === "ACTIVE" ? "success" : "danger"}>{agent.status.toLowerCase()}</ToneBadge>
            {canManage ? (
              agent.status === "ACTIVE" ? (
                <ConfirmAction
                  action={setAgentStatusAction}
                  trigger="Suspend"
                  triggerVariant="destructive"
                  destructive
                  title="Suspend this agent?"
                  description="The agent keeps read access to their history but can no longer refer customers or start applications. Existing attribution and commissions are unchanged."
                  fields={{ agentId: agent.id, status: "SUSPENDED" }}
                  reason={{ label: "Reason", required: true }}
                  confirmLabel="Suspend agent"
                />
              ) : (
                <ConfirmAction action={setAgentStatusAction} trigger="Reactivate" title="Reactivate this agent?" fields={{ agentId: agent.id, status: "ACTIVE" }} reason={{ label: "Reason", required: true }} confirmLabel="Reactivate" />
              )
            ) : null}
          </>
        }
      />
      {created ? <p role="status" className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">Agent onboarded. An invitation email has been queued.</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profile">
          <DescriptionList
            items={[
              { label: "Account status", value: agent.userStatus.toLowerCase() },
              { label: "Phone", value: agent.phone ?? "—" },
              { label: "Company", value: agent.companyName ?? "—" },
              { label: "City", value: agent.city ?? "—" },
              { label: "Payout reference", value: agent.payoutReferenceMasked ?? "—" },
              { label: "Onboarded", value: formatDateTime(agent.approvedAt ?? agent.createdAt) },
            ]}
          />
          {actor.permissions.has("users.read") ? (
            <Link href={`/admin/users/${agent.userId}`} className="mt-4 inline-block text-sm text-primary hover:underline">Manage user account</Link>
          ) : null}
        </Section>
        {canManage ? (
          <Section title="Edit agent">
            <ActionForm action={updateAgentAction} className="grid gap-4">
              <input type="hidden" name="agentId" value={agent.id} />
              <TextField label="Company / firm" name="companyName" defaultValue={agent.companyName ?? ""} />
              <TextField label="City" name="city" defaultValue={agent.city ?? ""} />
              <TextField label="Payout reference (masked)" name="payoutReferenceMasked" defaultValue={agent.payoutReferenceMasked ?? ""} />
              <TextAreaField label="Internal notes" name="notes" defaultValue={agent.notes ?? ""} rows={2} />
              <div>
                <SubmitButton>Save</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        ) : null}

        {commissions ? (
          <Section title="Commissions" className="lg:col-span-2">
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Pending verification" value={formatMoney(sumBy(["PENDING_VERIFICATION", "ADJUSTMENT_REQUIRED"]))} />
              <StatCard label="Approved (payable)" value={formatMoney(sumBy(["APPROVED"]))} />
              <StatCard label="Paid" value={formatMoney(sumBy(["PAID"]))} />
              <StatCard label="Records" value={commissions.total} />
            </div>
            {commissions.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No commissions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell><Link href={`/admin/commissions/${c.id}`} className="font-medium hover:underline">{c.reference}</Link></TableCell>
                      <TableCell><CommissionBadge status={c.status} /></TableCell>
                      <TableCell className="text-right">{formatMoney(c.baseAmount)}</TableCell>
                      <TableCell className="text-right">{formatMoney(c.payableAmount)}</TableCell>
                      <TableCell>{formatDate(c.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        ) : null}

        {apps ? (
          <Section title={`Referred applications (${apps.length})`} className="lg:col-span-2">
            {apps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No applications attributed to this agent yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apps.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell><Link href={`/admin/applications/${a.id}`} className="font-medium hover:underline">{a.reference}</Link></TableCell>
                      <TableCell>{a.customer_name}</TableCell>
                      <TableCell>{a.product_name}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-right">{formatMoney(a.requested_amount)}</TableCell>
                      <TableCell>{formatDate(a.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        ) : null}
      </div>
    </>
  );
}
