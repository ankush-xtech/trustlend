import type { ApplicationDetail } from "@/server/services/applications";
import type { Actor } from "@/server/rbac/actor";
import { env } from "@/server/config/env";
import { listAssignableStaff } from "@/server/services/users";
import { listAgentOptions } from "@/server/services/agents";
import { addNoteAction, withdrawAction } from "@/server/actions/applications";
import { UPLOAD_STATUSES } from "@/lib/domain/workflow";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CommissionBadge, LinkButton, Section, ToneBadge } from "@/components/shared/display";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { ApplicantDetails, CustomerStatusCallout, DecisionSummary, SummaryHeader, Timeline } from "./detail-sections";
import { InfoRequests } from "./info-requests";
import { DocumentUploader } from "./document-uploader";
import { DocumentReview } from "./document-review";
import { NoteForm, WorkflowPanel } from "./workflow-panel";
import { AssignmentPanel, AttributionPanel } from "./admin-panels";

/** Applicant-side (customer or creating agent) and read-only views. */
export function ApplicantView({ d, editHref, portal }: { d: ApplicationDetail; editHref: string; portal: "customer" | "agent" }) {
  const a = d.application;
  const canUpload = d.canActAsApplicant && (UPLOAD_STATUSES as readonly string[]).includes(a.status) && a.status !== "DRAFT";
  const openRequests = d.informationRequests.filter((r) => r.status === "OPEN");
  return (
    <>
      <SummaryHeader d={d} />
      <div className="grid gap-6">
        <CustomerStatusCallout status={a.status} />
        {a.status === "DRAFT" && d.canActAsApplicant ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <p className="text-sm">This application is a draft. Continue where you left off — your saved steps are kept.</p>
            <LinkButton href={editHref}>Continue application</LinkButton>
          </div>
        ) : null}
        {d.informationRequests.length ? (
          <Section title={`Requests for information${openRequests.length ? ` (${openRequests.length} open)` : ""}`}>
            <InfoRequests items={d.informationRequests} mode={d.canActAsApplicant ? "applicant" : "readonly"} />
          </Section>
        ) : null}
        {a.status !== "DRAFT" ? (
          <Section
            title="Documents"
            description={canUpload ? "Upload replacements for rejected documents or any newly requested documents." : undefined}
          >
            {d.missingDocuments.length && canUpload ? (
              <p className="mb-3 text-sm text-[oklch(0.42_0.1_65)]">Missing: {d.missingDocuments.join(", ")}</p>
            ) : null}
            <DocumentUploader
              applicationId={a.id}
              requirements={d.documentRequirements}
              documents={d.documents}
              canUpload={canUpload}
              canRemove={false}
              maxMb={env().MAX_UPLOAD_MB}
            />
          </Section>
        ) : null}
        <DecisionSummaryForApplicant d={d} />
        {d.notes.length ? (
          <Section title="Messages from TrustLend">
            <ul className="grid gap-3">
              {d.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="whitespace-pre-line">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <Timeline d={d} customerView />
        {a.status !== "DRAFT" ? <ApplicantDetails d={d} /> : null}
        {d.actions.includes("withdraw") && portal === "customer" ? (
          <div className="flex justify-end">
            <ConfirmAction
              action={withdrawAction.bind(null, a.id)}
              trigger="Withdraw application"
              title="Withdraw this application?"
              description="Withdrawing stops processing. This cannot be undone; you can start a new application later."
              reason={{ label: "Why are you withdrawing?", required: true }}
              destructive
              confirmLabel="Withdraw"
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

function DecisionSummaryForApplicant({ d }: { d: ApplicationDetail }) {
  if (!d.lenderDecision && !d.disbursement) return null;
  return (
    <Section title="Lender decision">
      {d.lenderDecision ? (
        <p className="text-sm">
          {d.lenderDecision.decision === "APPROVED"
            ? `Approved by ${d.lenderDecision.lenderName} for ${formatMoney(d.lenderDecision.approvedAmount)} on ${d.lenderDecision.decisionDate}.`
            : `The lending partner did not approve this application.`}
        </p>
      ) : null}
      {d.disbursement ? <p className="mt-2 text-sm">Disbursement of {formatMoney(d.disbursement.amount)} confirmed on {d.disbursement.disbursedOn}.</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">Loan terms, interest rate and repayment schedule are provided by the lender.</p>
    </Section>
  );
}

/** Staff / admin view with document review and workflow controls. */
export async function StaffView({ d, actor, portal }: { d: ApplicationDetail; actor: Actor; portal: "staff" | "admin" }) {
  const a = d.application;
  const canReview = d.hasStaffAuthority && actor.permissions.has("applications.review_documents") && ["DOCUMENT_REVIEW", "INFORMATION_REQUIRED"].includes(a.status);
  const staff = actor.permissions.has("applications.assign") ? await listAssignableStaff(actor) : [];
  const agents = actor.permissions.has("applications.change_attribution") && actor.permissions.has("agents.read_all") ? await listAgentOptions(actor) : [];
  const active = d.assignments.find((x) => x.status === "ACTIVE") ?? null;
  const blockers = [
    ...d.unverifiedRequired.map((l) => `Required document not verified: ${l}`),
    ...(d.pendingDocumentCount ? [`${d.pendingDocumentCount} document(s) awaiting review`] : []),
    ...d.informationRequests.filter((r) => r.status === "OPEN" || r.status === "RESPONDED").map(() => "Unresolved information request"),
  ];
  const approved = d.lenderDecisions.find((x) => x.decision === "APPROVED");

  return (
    <>
      <SummaryHeader d={d} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="grid min-w-0 gap-6">
          <Section
            title="Documents"
            description={canReview ? "Open each document, then verify or reject it. Rejection reasons are shown to the applicant." : "Document review is available during the document review stage."}
          >
            <DocumentReview documents={d.documents} canReview={canReview} />
          </Section>
          <Section title="Information requests">
            <InfoRequests items={d.informationRequests} mode={d.hasStaffAuthority ? "staff" : "readonly"} />
          </Section>
          <ApplicantDetails d={d} />
          <DecisionSummary d={d} />
          <Section title="Notes" description="Internal notes are never shown to customers or agents.">
            {d.hasStaffAuthority && a.status !== "DRAFT" ? <NoteForm action={addNoteAction.bind(null, a.id)} /> : null}
            <ul className="mt-4 grid gap-3">
              {d.notes.map((n) => (
                <li key={n.id} className="rounded-lg border p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{n.authorName}</span>
                    <span>{formatDateTime(n.createdAt)}</span>
                    <ToneBadge tone={n.visibility === "INTERNAL" ? "neutral" : "info"}>{n.visibility === "INTERNAL" ? "Internal" : "Customer-visible"}</ToneBadge>
                  </div>
                  <p className="whitespace-pre-line">{n.body}</p>
                </li>
              ))}
              {d.notes.length === 0 ? <li className="text-sm text-muted-foreground">No notes yet.</li> : null}
            </ul>
          </Section>
          <Timeline d={d} customerView={false} />
        </div>

        <aside className="grid content-start gap-6">
          <Section title="Workflow">
            {d.hasStaffAuthority ? (
              <WorkflowPanel
                applicationId={a.id}
                version={a.version}
                actions={d.actions}
                lenderName={a.lenderName}
                approvedAmount={approved?.approvedAmount ?? null}
                approvedTenure={approved?.approvedTenureMonths ?? null}
                blockers={blockers}
                categories={d.documentRequirements.map((r) => r.category)}
                afterHandoffHref={portal === "staff" && !actor.permissions.has("applications.read_all") ? "/staff?handedOff=1" : undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground">You can view this application but have no active assignment on it.</p>
            )}
          </Section>
          <Section title="Attribution">
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Source</dt>
                <dd>{a.acquisitionSource === "AGENT_REFERRAL" ? "Agent referral" : "Direct customer"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Referring agent</dt>
                <dd>{d.agent ? `${d.agent.name} (${d.agent.agentCode})` : "None"}</dd>
              </div>
            </dl>
            {agents.length && portal === "admin" ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Change attribution</summary>
                <div className="mt-3">
                  <AttributionPanel applicationId={a.id} agents={agents} currentAgentId={a.referringAgentId} />
                </div>
              </details>
            ) : null}
          </Section>
          <Section title="Assignment">
            {active ? (
              <p className="mb-3 text-sm">
                Assigned to <span className="font-medium">{active.assigneeName}</span> · {active.stage === "DOCUMENT_REVIEW" ? "Document review" : "Processing"} since {formatDateTime(active.assignedAt)}
              </p>
            ) : (
              <p className="mb-3 text-sm text-muted-foreground">Not currently assigned.</p>
            )}
            {staff.length && portal === "admin" ? <AssignmentPanel applicationId={a.id} staff={staff} currentAssigneeId={active?.assigneeId ?? null} /> : null}
            {d.assignments.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Assignment history ({d.assignments.length})</summary>
                <ul className="mt-2 grid gap-2 text-xs text-muted-foreground">
                  {d.assignments.map((x) => (
                    <li key={x.id}>
                      {x.assigneeName} · {x.status.toLowerCase()} · {formatDateTime(x.assignedAt)}
                      {x.assignedByName ? ` by ${x.assignedByName}` : ""}
                      {x.endedAt ? ` → ${formatDateTime(x.endedAt)}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Section>
          {d.commission ? (
            <Section title="Commission">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>{formatMoney(d.commission.payableAmount)}</span>
                <CommissionBadge status={d.commission.status} />
              </div>
              {portal === "admin" ? (
                <LinkButton href={`/admin/commissions/${d.commission.id}`} variant="outline" size="sm" className="mt-3">
                  Open commission
                </LinkButton>
              ) : null}
            </Section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
