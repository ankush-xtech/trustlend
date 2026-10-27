import { CheckCircle2Icon, CircleIcon, ClockIcon } from "lucide-react";
import type { ApplicationDetail } from "@/server/services/applications";
import { APPLICANT_TYPE_LABELS, extraFieldsFor, type ApplicantTypeValue } from "@/lib/domain/product-config";
import { CUSTOMER_STATUS_EXPLANATIONS, STATUS_LABELS, type ApplicationStatusValue } from "@/lib/domain/labels";
import { formatDate, formatDateTime, formatMoney, formatTenure } from "@/lib/format";
import { DescriptionList, Section, StatusBadge, ToneBadge } from "@/components/shared/display";

/** Server-rendered sections of the application detail page shared by all portals. */

export function SummaryHeader({ d }: { d: ApplicationDetail }) {
  const a = d.application;
  return (
    <div className="mb-6 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{d.product.name}</p>
          <h1 className="mt-0.5 font-mono text-xl font-semibold tracking-tight sm:text-2xl">{a.reference}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.customer.fullName}
            {a.submittedAt ? ` · Submitted ${formatDate(a.submittedAt)}` : ` · Started ${formatDate(a.createdAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={a.status} />
          {a.acquisitionSource ? (
            <ToneBadge tone={a.acquisitionSource === "AGENT_REFERRAL" ? "info" : "neutral"}>{a.acquisitionSource === "AGENT_REFERRAL" ? "Agent referral" : "Direct"}</ToneBadge>
          ) : null}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Requested amount</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(a.requestedAmount, d.product.currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Preferred tenure</dt>
          <dd className="font-medium">{formatTenure(a.requestedTenureMonths)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{d.lenderDecision?.decision === "APPROVED" ? "Lender-approved amount" : "Lender decision"}</dt>
          <dd className="font-medium tabular-nums">
            {d.lenderDecision ? (d.lenderDecision.decision === "APPROVED" ? formatMoney(d.lenderDecision.approvedAmount, d.product.currency) : "Not approved") : "Pending"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Disbursed</dt>
          <dd className="font-medium tabular-nums">{d.disbursement ? `${formatMoney(d.disbursement.amount, d.product.currency)} on ${formatDate(d.disbursement.disbursedOn)}` : "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function CustomerStatusCallout({ status }: { status: string }) {
  const info = CUSTOMER_STATUS_EXPLANATIONS[status as ApplicationStatusValue];
  if (!info) return null;
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
      <p className="text-sm font-semibold text-primary">{info.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
    </div>
  );
}

export function Timeline({ d, customerView }: { d: ApplicationDetail; customerView: boolean }) {
  return (
    <Section title="Timeline">
      <ol className="relative ml-2 border-l pl-5">
        {d.history.map((h, i) => {
          const last = i === d.history.length - 1;
          const label = customerView ? CUSTOMER_STATUS_EXPLANATIONS[h.toStatus as ApplicationStatusValue]?.title ?? h.toStatus : STATUS_LABELS[h.toStatus as ApplicationStatusValue] ?? h.toStatus;
          return (
            <li key={h.id} className="mb-5 last:mb-0">
              <span className="absolute -left-[9px] mt-0.5 rounded-full bg-card">
                {last ? <ClockIcon className="size-4 text-primary" aria-hidden /> : <CheckCircle2Icon className="size-4 text-success" aria-hidden />}
              </span>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(h.createdAt)}
                {!customerView && h.actorName ? ` · ${h.actorName}` : ""}
                {!customerView && !h.customerVisible ? " · internal" : ""}
              </p>
              {h.reason && (!customerView || !["Application started"].includes(h.reason)) ? <p className="mt-0.5 text-sm text-muted-foreground">{h.reason}</p> : null}
            </li>
          );
        })}
        {d.history.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            <CircleIcon className="mr-1 inline size-3" /> No events yet.
          </li>
        ) : null}
      </ol>
    </Section>
  );
}

export function ApplicantDetails({ d }: { d: ApplicationDetail }) {
  const applicant = d.applicant;
  const current = d.addresses.find((a) => a.type === "CURRENT");
  const permanent = d.addresses.find((a) => a.type === "PERMANENT");
  const fmt = (a?: typeof current) => (a ? [a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", ") : "—");
  const extra = extraFieldsFor(d.product.config, d.application.applicantType as ApplicantTypeValue | null);
  return (
    <div className="grid gap-6">
      <Section title="Applicant">
        <DescriptionList
          items={[
            { label: "Full name", value: applicant?.fullName },
            { label: "Date of birth", value: applicant ? formatDate(applicant.dateOfBirth) : "—" },
            { label: "Mobile", value: applicant?.mobile },
            { label: "Email", value: applicant?.email },
            { label: "Identity document", value: applicant?.identityDocumentType ? `${applicant.identityDocumentType} (ending ${applicant.identityNumberLast4})` : "—" },
            { label: "Current address", value: fmt(current) },
            { label: "Permanent address", value: applicant?.permanentSameAsCurrent ? "Same as current" : fmt(permanent) },
          ]}
        />
      </Section>
      {d.references.length ? (
        <Section title="References" description="References are not guarantors or co-applicants.">
          <DescriptionList items={d.references.map((r) => ({ label: `Reference ${r.position}`, value: `${r.fullName} · ${r.relationship} · ${r.mobile}${r.city ? ` · ${r.city}` : ""}` }))} />
        </Section>
      ) : null}
      <Section title="Income">
        <DescriptionList
          items={[
            { label: "Applicant type", value: d.application.applicantType ? APPLICANT_TYPE_LABELS[d.application.applicantType as ApplicantTypeValue] : "—" },
            ...(d.employment
              ? [
                  { label: "Employer", value: d.employment.employerName },
                  { label: "Job title", value: d.employment.jobTitle },
                  { label: "Employment type", value: d.employment.employmentType },
                  { label: "Work experience", value: `${d.employment.workExperienceMonths} months` },
                  { label: "Monthly income", value: formatMoney(d.employment.monthlyIncome) },
                ]
              : []),
            ...(d.business
              ? [
                  { label: "Business", value: d.business.businessName },
                  { label: "Business type", value: d.business.businessType },
                  { label: "Registration no.", value: d.business.registrationNumber ?? "—" },
                  { label: "Business address", value: d.business.businessAddress },
                  { label: "Years in operation", value: String(d.business.yearsInOperation) },
                  { label: "Annual turnover", value: formatMoney(d.business.annualTurnover) },
                  { label: "Annual income", value: formatMoney(d.business.annualIncome) },
                ]
              : []),
          ]}
        />
      </Section>
      <Section title="Loan requirement">
        <DescriptionList
          items={[
            { label: "Requested amount", value: formatMoney(d.application.requestedAmount) },
            { label: "Preferred tenure", value: formatTenure(d.application.requestedTenureMonths) },
            { label: "Purpose", value: d.application.loanPurpose },
            ...extra.map((f) => {
              const v = d.application.productDetails?.[f.key];
              return { label: f.label, value: v === undefined || v === null || v === "" ? "—" : f.type === "money" ? formatMoney(String(v)) : String(v) };
            }),
          ]}
        />
      </Section>
    </div>
  );
}

export function DecisionSummary({ d }: { d: ApplicationDetail }) {
  if (!d.lenderDecisions.length && !d.application.internalReviewOutcome && !d.disbursement) return null;
  return (
    <Section title="Decisions & disbursement" description="Internal review outcomes and lender decisions are recorded separately.">
      <div className="grid gap-4">
        {d.application.internalReviewOutcome ? (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">Internal review: {d.application.internalReviewOutcome === "RECOMMENDED" ? "Recommended" : "Not recommended"}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(d.application.internalReviewedAt)}</p>
            {d.application.internalReviewNotes ? <p className="mt-1 text-muted-foreground">{d.application.internalReviewNotes}</p> : null}
          </div>
        ) : null}
        {d.application.lenderName ? (
          <p className="text-sm">
            Lender: <span className="font-medium">{d.application.lenderName}</span>
            {d.application.lenderReference ? ` · Ref ${d.application.lenderReference}` : ""}
          </p>
        ) : null}
        {d.lenderDecisions.map((ld) => (
          <div key={ld.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">
              Lender {ld.decision === "APPROVED" ? "approval" : "rejection"} · {ld.lenderName}
              {ld.approvedAmount ? ` · ${formatMoney(ld.approvedAmount)}` : ""}
              {ld.approvedTenureMonths ? ` · ${formatTenure(ld.approvedTenureMonths)}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Decision date {formatDate(ld.decisionDate)} · recorded {formatDateTime(ld.createdAt)}
              {ld.lenderReference ? ` · Ref ${ld.lenderReference}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">Evidence: {ld.evidenceNote}</p>
          </div>
        ))}
        {d.disbursement ? (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
            <p className="font-medium">
              Disbursed {formatMoney(d.disbursement.amount)} on {formatDate(d.disbursement.disbursedOn)}
            </p>
            {d.disbursement.lenderReference ? <p className="text-xs text-muted-foreground">Lender reference {d.disbursement.lenderReference}</p> : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
