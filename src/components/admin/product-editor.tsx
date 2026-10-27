"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { productInputSchema } from "@/lib/validation/product";
import { APPLICANT_TYPES, APPLICANT_TYPE_LABELS, EXTRA_FIELD_TYPES, DEFAULT_PRODUCT_CONFIG } from "@/lib/domain/product-config";
import { saveProductAction } from "@/server/actions/admin";
import { errorAt, inputClass, Labelled, textareaClass } from "./form-bits";

type Input = z.input<typeof productInputSchema>;
type Output = z.output<typeof productInputSchema>;

const emptyToUndefined = (v: unknown) => (v === "" || v === null || (typeof v === "number" && Number.isNaN(v)) ? undefined : Number(v));
const emptyToNull = (v: unknown) => (v === "" || v === null || (typeof v === "number" && Number.isNaN(v)) ? null : Number(v));

export const EMPTY_PRODUCT: Input = {
  code: "",
  slug: "",
  name: "",
  shortDescription: "",
  description: "",
  referencePrefix: "",
  minAmount: "",
  maxAmount: "",
  isActive: false,
  config: DEFAULT_PRODUCT_CONFIG,
};

export function ProductEditor({ productId, initial, readOnly = false }: { productId: string | null; initial: Input; readOnly?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(productInputSchema), defaultValues: initial, mode: "onBlur" });
  const { register, control, handleSubmit, formState } = form;
  const errors = formState.errors;
  const extra = useFieldArray({ control, name: "config.extraFields" });

  const onSubmit = handleSubmit((data) =>
    startTransition(async () => {
      const res = await saveProductAction(productId, data);
      if (res.status === "success") {
        toast.success(res.message ?? "Saved");
        const id = res.data?.id as string | undefined;
        if (!productId && id) router.push(`/admin/products/${id}`);
        else router.refresh();
      } else {
        const details = res.fieldErrors ? Object.entries(res.fieldErrors).map(([k, v]) => `${k}: ${v?.[0]}`).join("; ") : "";
        toast.error(`${res.message ?? "Could not save"}${details ? ` (${details})` : ""}`);
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <fieldset disabled={readOnly || pending} className="grid gap-6">
        <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="text-base font-semibold">Product</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Labelled label="Name" htmlFor="p-name" error={errorAt(errors, "name")}>
              <input id="p-name" className={inputClass} {...register("name")} />
            </Labelled>
            <Labelled label="Code" htmlFor="p-code" error={errorAt(errors, "code")} hint="e.g. HOME_LOAN">
              <input id="p-code" className={inputClass} {...register("code")} />
            </Labelled>
            <Labelled label="URL slug" htmlFor="p-slug" error={errorAt(errors, "slug")} hint="e.g. home-loan">
              <input id="p-slug" className={inputClass} {...register("slug")} />
            </Labelled>
            <Labelled label="Reference prefix" htmlFor="p-prefix" error={errorAt(errors, "referencePrefix")} hint="Two letters used in application references, e.g. HL">
              <input id="p-prefix" maxLength={2} className={inputClass} {...register("referencePrefix")} />
            </Labelled>
            <Labelled label="Minimum amount (₹)" htmlFor="p-min" error={errorAt(errors, "minAmount")}>
              <input id="p-min" inputMode="decimal" className={inputClass} {...register("minAmount")} />
            </Labelled>
            <Labelled label="Maximum amount (₹)" htmlFor="p-max" error={errorAt(errors, "maxAmount")}>
              <input id="p-max" inputMode="decimal" className={inputClass} {...register("maxAmount")} />
            </Labelled>
          </div>
          <Labelled label="Short description" htmlFor="p-short" error={errorAt(errors, "shortDescription")}>
            <input id="p-short" className={inputClass} {...register("shortDescription")} />
          </Labelled>
          <Labelled label="Full description" htmlFor="p-desc" error={errorAt(errors, "description")} hint="Shown on the public product page. Do not claim lender partnerships, rates or guaranteed approval unless verified.">
            <textarea id="p-desc" rows={4} className={textareaClass} {...register("description")} />
          </Labelled>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("isActive")} />
            Active (available for new applications and listed publicly)
          </label>
        </section>

        <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="text-base font-semibold">Eligibility rules & application fields</h2>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Applicant types accepted</legend>
            <div className="flex flex-wrap gap-4">
              {APPLICANT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" value={t} className="size-4 accent-[var(--primary)]" {...register("config.applicantTypes")} />
                  {APPLICANT_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
            {errorAt(errors, "config.applicantTypes") ? <p className="text-xs text-destructive">{errorAt(errors, "config.applicantTypes")}</p> : null}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Controller
              control={control}
              name="config.tenureOptionsMonths"
              render={({ field }) => (
                <Labelled label="Tenure options (months)" htmlFor="p-tenure" error={errorAt(errors, "config.tenureOptionsMonths")} hint="Comma separated, e.g. 12, 24, 36">
                  <input
                    id="p-tenure"
                    className={inputClass}
                    defaultValue={(field.value ?? []).join(", ")}
                    onBlur={(e) =>
                      field.onChange(
                        e.target.value
                          .split(",")
                          .map((s) => Number(s.trim()))
                          .filter((n) => Number.isFinite(n) && n > 0),
                      )
                    }
                  />
                </Labelled>
              )}
            />
            <Labelled label="Minimum applicant age" htmlFor="p-minage" error={errorAt(errors, "config.rules.minApplicantAge")}>
              <input id="p-minage" type="number" className={inputClass} {...register("config.rules.minApplicantAge", { valueAsNumber: true })} />
            </Labelled>
            <Labelled label="Maximum applicant age" htmlFor="p-maxage" error={errorAt(errors, "config.rules.maxApplicantAge")}>
              <input id="p-maxage" type="number" className={inputClass} {...register("config.rules.maxApplicantAge", { valueAsNumber: true })} />
            </Labelled>
            <Labelled label="Min. work experience (months, salaried)" htmlFor="p-exp" error={errorAt(errors, "config.rules.minWorkExperienceMonths")} hint="Leave blank for no rule">
              <input id="p-exp" type="number" className={inputClass} {...register("config.rules.minWorkExperienceMonths", { setValueAs: emptyToNull })} />
            </Labelled>
            <Labelled label="Min. years in operation (business)" htmlFor="p-yio" error={errorAt(errors, "config.rules.minYearsInOperation")} hint="Leave blank for no rule">
              <input id="p-yio" type="number" className={inputClass} {...register("config.rules.minYearsInOperation", { setValueAs: emptyToNull })} />
            </Labelled>
            <Labelled label="Personal references required" htmlFor="p-refs" error={errorAt(errors, "config.referencesRequired")}>
              <select id="p-refs" className={inputClass} {...register("config.referencesRequired", { valueAsNumber: true })}>
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Labelled>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("config.requirePermanentAddress")} />
            Require a permanent address (applicants can mark it the same as current)
          </label>
          <Controller
            control={control}
            name="config.eligibilityNotes"
            render={({ field }) => (
              <Labelled label="Informational eligibility notes" htmlFor="p-notes" error={errorAt(errors, "config.eligibilityNotes")} hint="One per line. Shown as information only, never as an eligibility decision.">
                <textarea
                  id="p-notes"
                  rows={3}
                  className={textareaClass}
                  defaultValue={(field.value ?? []).join("\n")}
                  onBlur={(e) => field.onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                />
              </Labelled>
            )}
          />
        </section>

        <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Product-specific fields (wizard step 4)</h2>
              <p className="text-sm text-muted-foreground">Extra fields collected for this product and validated on the server.</p>
            </div>
            {!readOnly ? (
              <Button type="button" variant="outline" size="sm" onClick={() => extra.append({ key: "", label: "", type: "text", required: false })}>
                <PlusIcon /> Add field
              </Button>
            ) : null}
          </div>
          {extra.fields.length === 0 ? <p className="text-sm text-muted-foreground">No extra fields.</p> : null}
          {extra.fields.map((f, i) => (
            <div key={f.id} className="grid gap-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Labelled label="Key" htmlFor={`ef-key-${i}`} error={errorAt(errors, `config.extraFields.${i}.key`)}>
                  <input id={`ef-key-${i}`} className={inputClass} placeholder="property_value" {...register(`config.extraFields.${i}.key`)} />
                </Labelled>
                <Labelled label="Label" htmlFor={`ef-label-${i}`} error={errorAt(errors, `config.extraFields.${i}.label`)}>
                  <input id={`ef-label-${i}`} className={inputClass} {...register(`config.extraFields.${i}.label`)} />
                </Labelled>
                <Labelled label="Type" htmlFor={`ef-type-${i}`}>
                  <select id={`ef-type-${i}`} className={inputClass} {...register(`config.extraFields.${i}.type`)}>
                    {EXTRA_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Labelled>
                <Controller
                  control={control}
                  name={`config.extraFields.${i}.options`}
                  render={({ field }) => (
                    <Labelled label="Options (select only)" htmlFor={`ef-opt-${i}`} error={errorAt(errors, `config.extraFields.${i}.options`)} hint="Comma separated">
                      <input
                        id={`ef-opt-${i}`}
                        className={inputClass}
                        defaultValue={(field.value ?? []).join(", ")}
                        onBlur={(e) => {
                          const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          field.onChange(list.length ? list : undefined);
                        }}
                      />
                    </Labelled>
                  )}
                />
                <Labelled label="Min (number)" htmlFor={`ef-min-${i}`}>
                  <input id={`ef-min-${i}`} type="number" className={inputClass} {...register(`config.extraFields.${i}.min`, { setValueAs: emptyToUndefined })} />
                </Labelled>
                <Labelled label="Max (number)" htmlFor={`ef-max-${i}`}>
                  <input id={`ef-max-${i}`} type="number" className={inputClass} {...register(`config.extraFields.${i}.max`, { setValueAs: emptyToUndefined })} />
                </Labelled>
                <Labelled label="Help text" htmlFor={`ef-help-${i}`} className="sm:col-span-2">
                  <input id={`ef-help-${i}`} className={inputClass} {...register(`config.extraFields.${i}.helpText`, { setValueAs: (v) => (v ? v : undefined) })} />
                </Labelled>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register(`config.extraFields.${i}.required`)} />
                  Required
                </label>
                <span className="text-muted-foreground">Only for:</span>
                {APPLICANT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-1.5">
                    <input type="checkbox" value={t} className="size-4 accent-[var(--primary)]" {...register(`config.extraFields.${i}.applicantTypes`)} />
                    {APPLICANT_TYPE_LABELS[t]}
                  </label>
                ))}
                <span className="text-xs text-muted-foreground">(none = all applicants)</span>
                {!readOnly ? (
                  <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => extra.remove(i)}>
                    <Trash2Icon /> Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      </fieldset>
      {!readOnly ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : productId ? "Save product" : "Create product"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
