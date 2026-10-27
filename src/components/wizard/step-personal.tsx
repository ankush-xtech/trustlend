"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step1Schema, type Step1Data, type Step1Input } from "@/lib/validation/application";
import { IDENTITY_DOCUMENT_TYPES } from "@/lib/domain/labels";
import { FormSection, RInput, RSelect } from "./fields";
import { StepNav } from "./step-nav";
import { applyServerErrors, type StepProps } from "./types";

export function StepPersonal({ state, save, disabled }: StepProps) {
  const schema = step1Schema(state.product.config);
  const initial = state.inputs.step1 ?? {
    fullName: state.prefill.fullName,
    email: state.prefill.email,
    mobile: state.prefill.mobile,
    dateOfBirth: "",
    identityDocumentType: "",
    identityNumberLast4: "",
  };
  const form = useForm<Step1Input, unknown, Step1Data>({ resolver: zodResolver(schema), defaultValues: initial as Step1Input, mode: "onTouched" });
  const [submitting, setSubmitting] = useState(false);
  const { register, formState, handleSubmit, setError } = form;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    const result = await save(1, values);
    setSubmitting(false);
    if (!result.ok) applyServerErrors(setError, result.fieldErrors);
  });

  const { minApplicantAge, maxApplicantAge } = state.product.config.rules;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset disabled={disabled || submitting} className="grid gap-5">
        <FormSection title="About the applicant" description="Enter details exactly as they appear on your identity documents.">
          <div className="grid gap-4 sm:grid-cols-2">
            <RInput name="fullName" label="Full legal name" register={register} errors={formState.errors} required autoComplete="name" className="sm:col-span-2" />
            <RInput
              name="dateOfBirth"
              label="Date of birth"
              type="date"
              register={register}
              errors={formState.errors}
              required
              hint={`Applicants must be ${minApplicantAge}–${maxApplicantAge} years old for this product.`}
              autoComplete="bday"
            />
            <RInput name="mobile" label="Mobile number" register={register} errors={formState.errors} required inputMode="tel" autoComplete="tel" hint="10-digit Indian mobile number" />
            <RInput name="email" label="Email address" type="email" register={register} errors={formState.errors} required autoComplete="email" className="sm:col-span-2" />
          </div>
        </FormSection>
        <FormSection
          title="Identity"
          description="For your security we store only the last 4 characters of your identity number. You'll upload the document itself in step 5."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <RSelect name="identityDocumentType" label="Identity document" register={register} errors={formState.errors} options={IDENTITY_DOCUMENT_TYPES} required />
            <RInput
              name="identityNumberLast4"
              label="Last 4 characters of the ID number"
              register={register}
              errors={formState.errors}
              required
              maxLength={4}
              autoComplete="off"
              className="uppercase"
            />
          </div>
        </FormSection>
      </fieldset>
      <StepNav submitting={submitting} disabled={disabled} />
    </form>
  );
}
