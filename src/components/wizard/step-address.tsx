"use client";

import { useState } from "react";
import { useFieldArray, useForm, useWatch, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step2Schema, type Step2Data, type Step2Input } from "@/lib/validation/application";
import { INDIAN_STATES, RELATIONSHIPS } from "@/lib/domain/labels";
import { FormSection, RCheckbox, RInput, RSelect } from "./fields";
import { StepNav } from "./step-nav";
import { applyServerErrors, type StepProps } from "./types";

const emptyAddress = { line1: "", line2: "", city: "", state: "" as Step2Input["currentAddress"]["state"], postalCode: "", country: "India" as const, yearsAtAddress: undefined };

function AddressFields({ prefix, register, errors }: { prefix: "currentAddress" | "permanentAddress"; register: UseFormRegister<Step2Input>; errors: FieldErrors<Step2Input> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <RInput name={`${prefix}.line1`} label="Address line 1" register={register} errors={errors} required className="sm:col-span-6" autoComplete="address-line1" />
      <RInput name={`${prefix}.line2`} label="Address line 2" register={register} errors={errors} className="sm:col-span-6" autoComplete="address-line2" />
      <RInput name={`${prefix}.city`} label="City" register={register} errors={errors} required className="sm:col-span-2" autoComplete="address-level2" />
      <RSelect name={`${prefix}.state`} label="State / UT" register={register} errors={errors} options={INDIAN_STATES} required className="sm:col-span-2" />
      <RInput name={`${prefix}.postalCode`} label="PIN code" register={register} errors={errors} required inputMode="numeric" maxLength={6} className="sm:col-span-1" autoComplete="postal-code" />
      <RInput
        name={`${prefix}.yearsAtAddress`}
        label="Years here"
        type="number"
        min={0}
        register={register}
        errors={errors}
        className="sm:col-span-1"
      />
    </div>
  );
}

export function StepAddress({ state, save, disabled, onBack }: StepProps) {
  const config = state.product.config;
  const schema = step2Schema(config);
  const refCount = config.referencesRequired;
  const initial: Step2Input = state.inputs.step2
    ? ({
        ...state.inputs.step2,
        permanentAddress: state.inputs.step2.permanentAddress ?? emptyAddress,
        references: Array.from({ length: refCount }, (_, i) => state.inputs.step2!.references[i] ?? { fullName: "", relationship: "" as never, mobile: "", city: "" }),
      } as Step2Input)
    : {
        currentAddress: emptyAddress,
        permanentSameAsCurrent: true,
        permanentAddress: emptyAddress,
        references: Array.from({ length: refCount }, () => ({ fullName: "", relationship: "" as never, mobile: "", city: "" })),
        referenceConsent: false,
      };
  const form = useForm<Step2Input, unknown, Step2Data>({ resolver: zodResolver(schema), defaultValues: initial, mode: "onTouched" });
  const { register, formState, handleSubmit, setError } = form;
  const { fields } = useFieldArray({ control: form.control, name: "references" });
  const same = useWatch({ control: form.control, name: "permanentSameAsCurrent" });
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    const payload = { ...values, permanentAddress: values.permanentSameAsCurrent ? undefined : values.permanentAddress };
    const result = await save(2, payload);
    setSubmitting(false);
    if (!result.ok) applyServerErrors(setError, result.fieldErrors);
  });

  return (
    <form
      onSubmit={(e) => {
        // The permanent address block is validated only when it is shown.
        if (form.getValues("permanentSameAsCurrent")) form.setValue("permanentAddress", undefined);
        return onSubmit(e);
      }}
      noValidate
      className="grid gap-5"
    >
      <fieldset disabled={disabled || submitting} className="grid gap-5">
        <FormSection title="Current address">
          <AddressFields prefix="currentAddress" register={register} errors={formState.errors} />
        </FormSection>
        {config.requirePermanentAddress ? (
          <FormSection title="Permanent address">
            <RCheckbox name="permanentSameAsCurrent" label="My permanent address is the same as my current address" register={register} errors={formState.errors} />
            {!same ? <AddressFields prefix="permanentAddress" register={register} errors={formState.errors} /> : null}
          </FormSection>
        ) : null}
        {refCount > 0 ? (
          <FormSection
            title="Personal references"
            description="References may be contacted only to confirm your identity and contact details. They are not guarantors or co-applicants and take on no liability."
          >
            {fields.map((field, index) => (
              <div key={field.id} className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
                <p className="text-sm font-medium sm:col-span-2">Reference {index + 1}</p>
                <RInput name={`references.${index}.fullName`} label="Full name" register={register} errors={formState.errors} required />
                <RSelect name={`references.${index}.relationship`} label="Relationship to you" register={register} errors={formState.errors} options={RELATIONSHIPS} required />
                <RInput name={`references.${index}.mobile`} label="Mobile number" register={register} errors={formState.errors} required inputMode="tel" />
                <RInput name={`references.${index}.city`} label="City" register={register} errors={formState.errors} />
              </div>
            ))}
            <RCheckbox
              name="referenceConsent"
              label="I confirm that my references have agreed to share their contact details and to be contacted by TrustLend or its lending partners for verification."
              register={register}
              errors={formState.errors}
            />
          </FormSection>
        ) : null}
      </fieldset>
      <StepNav onBack={onBack} submitting={submitting} disabled={disabled} />
    </form>
  );
}
