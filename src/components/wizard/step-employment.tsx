"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step3Schema, type Step3Data, type Step3Input } from "@/lib/validation/application";
import { APPLICANT_TYPE_LABELS, type ApplicantTypeValue } from "@/lib/domain/product-config";
import { BUSINESS_TYPES, EMPLOYMENT_TYPES } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { FormSection, RInput, RSelect, errorAt } from "./fields";
import { StepNav } from "./step-nav";
import { applyServerErrors, type StepProps } from "./types";

const APPLICANT_TYPE_HINTS: Record<ApplicantTypeValue, string> = {
  SALARIED: "You receive a regular salary from an employer.",
  SELF_EMPLOYED: "You are a professional such as a doctor, CA, architect or consultant.",
  BUSINESS: "You own or run a business (proprietorship, partnership or company).",
};

export function StepEmployment({ state, save, disabled, onBack }: StepProps) {
  const config = state.product.config;
  const schema = step3Schema(config);
  const saved = state.inputs.step3;
  const form = useForm<Step3Input, unknown, Step3Data>({
    resolver: zodResolver(schema),
    defaultValues: (saved ?? { applicantType: config.applicantTypes.length === 1 ? config.applicantTypes[0] : undefined }) as Step3Input,
    mode: "onTouched",
    shouldUnregister: true,
  });
  const { register, formState, handleSubmit, setError } = form;
  const applicantType = useWatch({ control: form.control, name: "applicantType" });
  const [submitting, setSubmitting] = useState(false);
  const changedType = saved?.applicantType && applicantType && saved.applicantType !== applicantType;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    const result = await save(3, values);
    setSubmitting(false);
    if (!result.ok) applyServerErrors(setError, result.fieldErrors);
  });

  const typeError = errorAt(formState.errors, "applicantType");
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset disabled={disabled || submitting} className="grid gap-5">
        <FormSection title="How do you earn your income?">
          <div role="radiogroup" aria-label="Applicant type" aria-invalid={!!typeError || undefined} className="grid gap-3 sm:grid-cols-3">
            {config.applicantTypes.map((t) => (
              <label
                key={t}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input type="radio" value={t} className="accent-[var(--primary)]" {...register("applicantType")} />
                  {APPLICANT_TYPE_LABELS[t]}
                </span>
                <span className="text-xs text-muted-foreground">{APPLICANT_TYPE_HINTS[t]}</span>
              </label>
            ))}
          </div>
          {typeError ? (
            <p className="text-xs font-medium text-destructive" role="alert">
              {typeError}
            </p>
          ) : null}
          {changedType ? (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-[oklch(0.4_0.09_65)]">
              Changing the applicant type may change the loan details and documents required. You&apos;ll be asked to review steps 4 and 5 again.
            </p>
          ) : null}
        </FormSection>

        {applicantType === "SALARIED" ? (
          <FormSection title="Employment details">
            <div className="grid gap-4 sm:grid-cols-2">
              <RInput name="employment.employerName" label="Employer name" register={register} errors={formState.errors} required autoComplete="organization" />
              <RInput name="employment.jobTitle" label="Job title" register={register} errors={formState.errors} required autoComplete="organization-title" />
              <RSelect name="employment.employmentType" label="Employment type" register={register} errors={formState.errors} options={EMPLOYMENT_TYPES} required />
              <RInput
                name="employment.workExperienceMonths"
                label="Total work experience (months)"
                type="number"
                min={0}
                register={register}
                errors={formState.errors}
                required
                hint={config.rules.minWorkExperienceMonths ? `Minimum ${config.rules.minWorkExperienceMonths} months for this product.` : undefined}
              />
              <RInput name="employment.monthlyIncome" label="Net monthly income (₹)" inputMode="decimal" register={register} errors={formState.errors} required hint="Take-home pay after deductions." />
            </div>
          </FormSection>
        ) : applicantType === "SELF_EMPLOYED" || applicantType === "BUSINESS" ? (
          <FormSection title={applicantType === "BUSINESS" ? "Business details" : "Practice / professional details"}>
            <div className="grid gap-4 sm:grid-cols-2">
              <RInput name="business.businessName" label={applicantType === "BUSINESS" ? "Business name" : "Practice or firm name"} register={register} errors={formState.errors} required />
              <RSelect name="business.businessType" label="Business type" register={register} errors={formState.errors} options={BUSINESS_TYPES} required />
              <RInput name="business.registrationNumber" label="Registration number (GSTIN / Udyam / CIN)" register={register} errors={formState.errors} hint="Optional if not registered." />
              <RInput
                name="business.yearsInOperation"
                label="Years in operation"
                type="number"
                min={0}
                register={register}
                errors={formState.errors}
                required
                hint={config.rules.minYearsInOperation ? `Minimum ${config.rules.minYearsInOperation} years for this product.` : undefined}
              />
              <RInput name="business.businessAddress" label="Business address" register={register} errors={formState.errors} required className="sm:col-span-2" />
              <RInput name="business.annualTurnover" label="Annual turnover (₹)" inputMode="decimal" register={register} errors={formState.errors} required />
              <RInput name="business.annualIncome" label="Annual income / profit (₹)" inputMode="decimal" register={register} errors={formState.errors} hint="As per your latest ITR, if available." />
            </div>
          </FormSection>
        ) : null}
      </fieldset>
      <StepNav onBack={onBack} submitting={submitting} disabled={disabled} />
    </form>
  );
}
