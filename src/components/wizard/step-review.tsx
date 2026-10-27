"use client";

import { useState } from "react";
import { ArrowLeftIcon, Loader2Icon, PencilIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APPLICANT_TYPE_LABELS, extraFieldsFor, type ApplicantTypeValue } from "@/lib/domain/product-config";
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategoryValue } from "@/lib/domain/labels";
import { formatDate, formatMoney, formatTenure } from "@/lib/format";
import type { WizardState } from "./types";

function Block({ title, step, onEdit, children, disabled }: { title: string; step: number; onEdit: (s: number) => void; children: React.ReactNode; disabled: boolean }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {!disabled ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => onEdit(step)}>
            <PencilIcon aria-hidden /> Edit
          </Button>
        ) : null}
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value || "—"}</dd>
    </div>
  );
}

export function StepReview({
  state,
  disabled,
  onBack,
  onEdit,
  onSubmit,
}: {
  state: WizardState;
  disabled: boolean;
  onBack: () => void;
  onEdit: (step: number) => void;
  onSubmit: (declarationAccepted: boolean) => Promise<boolean>;
}) {
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { step1, step2, step3, step4 } = state.inputs;
  const applicantType = state.application.applicantType as ApplicantTypeValue | null;
  const extra = extraFieldsFor(state.product.config, applicantType);
  const addr = (a?: { line1: string; line2?: string; city: string; state: string; postalCode: string }) =>
    a ? [a.line1, a.line2, a.city, a.state, a.postalCode].filter(Boolean).join(", ") : "";

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">Please check everything carefully. After submission the details can no longer be edited.</p>
      <Block title="Personal information" step={1} onEdit={onEdit} disabled={disabled}>
        <Row label="Full name" value={step1?.fullName} />
        <Row label="Date of birth" value={step1 ? formatDate(step1.dateOfBirth) : ""} />
        <Row label="Mobile" value={step1?.mobile} />
        <Row label="Email" value={step1?.email} />
        <Row label="Identity document" value={step1 ? `${step1.identityDocumentType} (ending ${step1.identityNumberLast4})` : ""} />
      </Block>
      <Block title="Address & references" step={2} onEdit={onEdit} disabled={disabled}>
        <Row label="Current address" value={addr(step2?.currentAddress)} />
        <Row label="Permanent address" value={step2?.permanentSameAsCurrent ? "Same as current" : addr(step2?.permanentAddress)} />
        {step2?.references.map((r, i) => (
          <Row key={i} label={`Reference ${i + 1}`} value={`${r.fullName} · ${r.relationship} · ${r.mobile}`} />
        ))}
      </Block>
      <Block title="Employment / business" step={3} onEdit={onEdit} disabled={disabled}>
        <Row label="Applicant type" value={step3 ? APPLICANT_TYPE_LABELS[step3.applicantType] : ""} />
        {step3?.employment ? (
          <>
            <Row label="Employer" value={step3.employment.employerName} />
            <Row label="Job title" value={step3.employment.jobTitle} />
            <Row label="Employment type" value={step3.employment.employmentType} />
            <Row label="Experience" value={`${step3.employment.workExperienceMonths} months`} />
            <Row label="Monthly income" value={formatMoney(String(step3.employment.monthlyIncome))} />
          </>
        ) : null}
        {step3?.business ? (
          <>
            <Row label="Business" value={step3.business.businessName} />
            <Row label="Type" value={step3.business.businessType} />
            <Row label="Years in operation" value={String(step3.business.yearsInOperation)} />
            <Row label="Annual turnover" value={formatMoney(String(step3.business.annualTurnover))} />
          </>
        ) : null}
      </Block>
      <Block title="Loan requirement" step={4} onEdit={onEdit} disabled={disabled}>
        <Row label="Product" value={state.product.name} />
        <Row label="Requested amount" value={step4 ? formatMoney(String(step4.requestedAmount)) : ""} />
        <Row label="Preferred tenure" value={step4 ? formatTenure(Number(step4.requestedTenureMonths)) : ""} />
        <Row label="Purpose" value={step4?.loanPurpose} />
        {extra.map((f) => (
          <Row
            key={f.key}
            label={f.label}
            value={f.type === "money" && step4?.productDetails?.[f.key] ? formatMoney(String(step4.productDetails[f.key])) : String(step4?.productDetails?.[f.key] ?? "")}
          />
        ))}
      </Block>
      <Block title="Documents" step={5} onEdit={onEdit} disabled={disabled}>
        {state.documents.length === 0 ? <Row label="Uploaded" value="No documents" /> : null}
        {state.documents.map((d) => (
          <Row key={d.id} label={DOCUMENT_CATEGORY_LABELS[d.category as DocumentCategoryValue] ?? d.category} value={d.originalFilename} />
        ))}
      </Block>

      <section className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4 sm:p-5">
        <h3 className="text-sm font-semibold">Declaration</h3>
        <label className="mt-2 flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={disabled} />
          <span>
            {state.application.createdByAgent
              ? "I confirm the applicant has reviewed this information, confirmed it is true and complete, and consented to TrustLend processing it and sharing it with lending partners for this application. "
              : "I confirm the information provided is true and complete. I consent to TrustLend processing my information and sharing it with lending partners to assess this application. "}
            I understand that submitting an application does not guarantee approval, and that the loan amount, rate and terms are decided by the lending
            partner.
          </span>
        </label>
        {error ? (
          <p className="mt-2 text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeftIcon aria-hidden /> Previous
        </Button>
        <Button
          type="button"
          disabled={disabled || !accepted || submitting}
          aria-busy={submitting}
          onClick={async () => {
            setError(null);
            setSubmitting(true);
            const ok = await onSubmit(accepted);
            if (!ok) setSubmitting(false);
          }}
        >
          {submitting ? <Loader2Icon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />}
          Submit application
        </Button>
      </div>
    </div>
  );
}
