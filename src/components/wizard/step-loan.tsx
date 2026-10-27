"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step4Schema, type Step4Data, type Step4Input } from "@/lib/validation/application";
import { extraFieldsFor, type ApplicantTypeValue } from "@/lib/domain/product-config";
import { formatMoney, formatTenure } from "@/lib/format";
import { FormSection, RInput, RSelect, RTextarea } from "./fields";
import { StepNav } from "./step-nav";
import { applyServerErrors, type StepProps } from "./types";

export function StepLoan({ state, save, disabled, onBack }: StepProps) {
  const applicantType = state.application.applicantType as ApplicantTypeValue | null;
  const limits = { minAmount: state.product.minAmount, maxAmount: state.product.maxAmount, config: state.product.config };
  const schema = step4Schema(limits, applicantType);
  const extra = extraFieldsFor(state.product.config, applicantType);
  const saved = state.inputs.step4;
  const form = useForm<Step4Input, unknown, Step4Data>({
    resolver: zodResolver(schema),
    defaultValues: (saved
      ? { ...saved, productDetails: Object.fromEntries(extra.map((f) => [f.key, saved.productDetails?.[f.key] ?? ""])) }
      : { requestedAmount: "", requestedTenureMonths: undefined, loanPurpose: "", productDetails: Object.fromEntries(extra.map((f) => [f.key, ""])) }) as Step4Input,
    mode: "onTouched",
  });
  const { register, formState, handleSubmit, setError } = form;
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    const result = await save(4, values);
    setSubmitting(false);
    if (!result.ok) applyServerErrors(setError, result.fieldErrors);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset disabled={disabled || submitting} className="grid gap-5">
        <FormSection
          title="Loan requirement"
          description="This is the amount you are requesting. The lending partner decides the final approved amount, rate and tenure."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <RInput
              name="requestedAmount"
              label="Requested loan amount (₹)"
              inputMode="decimal"
              register={register}
              errors={formState.errors}
              required
              hint={`Between ${formatMoney(state.product.minAmount)} and ${formatMoney(state.product.maxAmount)}`}
            />
            <RSelect
              name="requestedTenureMonths"
              label="Preferred repayment tenure"
              register={register}
              errors={formState.errors}
              valueAsNumber
              options={state.product.config.tenureOptionsMonths.map((m) => ({ value: m, label: formatTenure(m) }))}
              required
            />
            <RTextarea
              name="loanPurpose"
              label="Purpose of the loan"
              register={register}
              errors={formState.errors}
              required
              rows={3}
              className="sm:col-span-2"
              hint="Briefly describe how you plan to use the funds."
            />
          </div>
        </FormSection>
        {extra.length ? (
          <FormSection title={`${state.product.name} details`}>
            <div className="grid gap-4 sm:grid-cols-2">
              {extra.map((f) =>
                f.type === "select" ? (
                  <RSelect key={f.key} name={`productDetails.${f.key}`} label={f.label} register={register} errors={formState.errors} options={f.options ?? []} required={f.required} hint={f.helpText} />
                ) : (
                  <RInput
                    key={f.key}
                    name={`productDetails.${f.key}`}
                    label={f.type === "money" ? `${f.label} (₹)` : f.label}
                    register={register}
                    errors={formState.errors}
                    required={f.required}
                    hint={f.helpText}
                    inputMode={f.type === "text" ? undefined : "decimal"}
                    type={f.type === "number" ? "number" : "text"}
                    min={f.min}
                    max={f.max}
                  />
                ),
              )}
            </div>
          </FormSection>
        ) : null}
        <p className="text-xs text-muted-foreground">
          TrustLend does not show estimated EMIs, interest rates or approval chances. These are determined only by the lending partner after their assessment.
        </p>
      </fieldset>
      <StepNav onBack={onBack} submitting={submitting} disabled={disabled} />
    </form>
  );
}
