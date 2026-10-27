"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveCommissionRuleAction } from "@/server/actions/admin";
import { errorAt, inputClass, Labelled, textareaClass } from "./form-bits";

export interface RuleFormValues {
  name: string;
  description: string;
  productId: string;
  agentId: string;
  calcType: "PERCENTAGE" | "FIXED" | "SLAB";
  ratePercent: string;
  fixedAmount: string;
  slabs: { minAmount: string; maxAmount: string; ratePercent: string; fixedAmount: string }[];
  minBaseAmount: string;
  maxBaseAmount: string;
  capAmount: string;
  effectiveFrom: string;
  effectiveTo: string;
  priority: number;
  isActive: boolean;
}

/**
 * Commission rule form. Validation is authoritative on the server (commissionRuleSchema, slab
 * contiguity checks); server field errors are mapped back onto the form.
 */
export function CommissionRuleForm({
  ruleId,
  initial,
  products,
  agents,
  usage,
  readOnly = false,
}: {
  ruleId: string | null;
  initial: RuleFormValues;
  products: { id: string; name: string }[];
  agents: { id: string; label: string }[];
  usage: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, control, handleSubmit, getValues, setError, formState } = useForm<RuleFormValues>({ defaultValues: initial });
  const slabs = useFieldArray({ control, name: "slabs" });
  const calcType = useWatch({ control, name: "calcType" });
  const errors = formState.errors;
  const termsLocked = usage > 0;

  const onSubmit = handleSubmit((submitted) =>
    startTransition(async () => {
      // Locked terms are always resubmitted unchanged (disabled inputs may not report values).
      const values: RuleFormValues = termsLocked
        ? {
            ...submitted,
            productId: initial.productId,
            agentId: initial.agentId,
            calcType: initial.calcType,
            ratePercent: initial.ratePercent,
            fixedAmount: initial.fixedAmount,
            slabs: initial.slabs,
            minBaseAmount: initial.minBaseAmount,
            maxBaseAmount: initial.maxBaseAmount,
            capAmount: initial.capAmount,
            effectiveFrom: initial.effectiveFrom,
          }
        : submitted;
      const payload = {
        ...values,
        slabs: values.calcType === "SLAB" ? values.slabs.map((s) => ({ ...s, maxAmount: s.maxAmount || null })) : null,
        priority: Number(values.priority) || 0,
      };
      const res = await saveCommissionRuleAction(ruleId, payload);
      if (res.status === "success") {
        toast.success(res.message ?? "Saved");
        const id = res.data?.id as string | undefined;
        if (!ruleId && id) router.push(`/admin/commissions/rules/${id}`);
        else router.refresh();
      } else {
        for (const [key, msgs] of Object.entries(res.fieldErrors ?? {})) {
          if (msgs?.[0]) setError(key as keyof RuleFormValues, { message: msgs[0] });
        }
        toast.error(res.message ?? "Could not save the rule");
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      {termsLocked ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          This rule has been used for {usage} commission record(s). Its calculation terms are locked so past calculations stay reproducible. You can rename it, deactivate it or set an end date, then create a new rule.
        </p>
      ) : null}
      <fieldset disabled={readOnly || pending} className="grid gap-6">
        <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label="Rule name" htmlFor="r-name" error={errorAt(errors, "name")}>
              <input id="r-name" className={inputClass} {...register("name", { required: "Enter a name" })} />
            </Labelled>
            <Labelled label="Priority" htmlFor="r-priority" error={errorAt(errors, "priority")} hint="Higher wins when equally specific rules match">
              <input id="r-priority" type="number" className={inputClass} {...register("priority")} />
            </Labelled>
            <Labelled label="Description" htmlFor="r-desc" className="sm:col-span-2">
              <textarea id="r-desc" rows={2} className={textareaClass} {...register("description")} />
            </Labelled>
            <Labelled label="Loan product" htmlFor="r-product" error={errorAt(errors, "productId")} hint="Blank = all products">
              <select id="r-product" className={inputClass} disabled={termsLocked} {...register("productId")}>
                <option value="">All products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Labelled>
            <Labelled label="Agent-specific terms" htmlFor="r-agent" error={errorAt(errors, "agentId")} hint="Blank = all agents">
              <select id="r-agent" className={inputClass} disabled={termsLocked} {...register("agentId")}>
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Labelled>
            <Labelled label="Effective from" htmlFor="r-from" error={errorAt(errors, "effectiveFrom")}>
              <input id="r-from" type="date" className={inputClass} disabled={termsLocked} {...register("effectiveFrom")} />
            </Labelled>
            <Labelled label="Effective to (optional)" htmlFor="r-to" error={errorAt(errors, "effectiveTo")}>
              <input id="r-to" type="date" className={inputClass} {...register("effectiveTo")} />
            </Labelled>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("isActive")} />
            Active
          </label>
        </section>

        <section className="grid gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="text-base font-semibold">Calculation</h2>
          <p className="text-sm text-muted-foreground">
            The commission base is the confirmed disbursed principal. Results are rounded half-up to 2 decimals, then capped.
          </p>
          <fieldset className="flex flex-wrap gap-4" disabled={termsLocked}>
            <legend className="sr-only">Calculation type</legend>
            {(["PERCENTAGE", "FIXED", "SLAB"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="radio" value={t} className="size-4 accent-[var(--primary)]" {...register("calcType")} />
                {t === "PERCENTAGE" ? "Percentage of base" : t === "FIXED" ? "Fixed amount" : "Amount-based slabs"}
              </label>
            ))}
          </fieldset>
          <fieldset disabled={termsLocked} className="grid gap-4">
            {calcType === "PERCENTAGE" ? (
              <Labelled label="Rate (%)" htmlFor="r-rate" error={errorAt(errors, "ratePercent")}>
                <input id="r-rate" inputMode="decimal" className={`${inputClass} max-w-48`} {...register("ratePercent")} />
              </Labelled>
            ) : null}
            {calcType === "FIXED" ? (
              <Labelled label="Fixed amount (₹)" htmlFor="r-fixed" error={errorAt(errors, "fixedAmount")}>
                <input id="r-fixed" inputMode="decimal" className={`${inputClass} max-w-48`} {...register("fixedAmount")} />
              </Labelled>
            ) : null}
            {calcType === "SLAB" ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  Boundaries: minimum is <strong>inclusive</strong>, maximum is <strong>exclusive</strong>; leave the last slab&apos;s maximum blank for no upper limit. Slabs must be contiguous (each slab starts where the previous ends). The slab containing the base applies to the whole base. Each slab uses either a rate or a fixed amount.
                </p>
                {slabs.fields.map((f, i) => (
                  <div key={f.id} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-5">
                    <Labelled label="From (₹, incl.)" htmlFor={`s-min-${i}`}>
                      <input id={`s-min-${i}`} inputMode="decimal" className={inputClass} {...register(`slabs.${i}.minAmount`)} />
                    </Labelled>
                    <Labelled label="To (₹, excl.)" htmlFor={`s-max-${i}`}>
                      <input id={`s-max-${i}`} inputMode="decimal" placeholder="no limit" className={inputClass} {...register(`slabs.${i}.maxAmount`)} />
                    </Labelled>
                    <Labelled label="Rate (%)" htmlFor={`s-rate-${i}`}>
                      <input id={`s-rate-${i}`} inputMode="decimal" className={inputClass} {...register(`slabs.${i}.ratePercent`)} />
                    </Labelled>
                    <Labelled label="or fixed (₹)" htmlFor={`s-fixed-${i}`}>
                      <input id={`s-fixed-${i}`} inputMode="decimal" className={inputClass} {...register(`slabs.${i}.fixedAmount`)} />
                    </Labelled>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => slabs.remove(i)}>
                      <Trash2Icon /> Remove
                    </Button>
                  </div>
                ))}
                {errorAt(errors, "slabs") ? <p className="text-sm text-destructive">{errorAt(errors, "slabs")}</p> : null}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last = slabs.fields.length ? getValues(`slabs.${slabs.fields.length - 1}.maxAmount`) : "0";
                      slabs.append({ minAmount: last || "", maxAmount: "", ratePercent: "", fixedAmount: "" });
                    }}
                  >
                    <PlusIcon /> Add slab
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Labelled label="Min. eligible base (₹, incl.)" htmlFor="r-minb" error={errorAt(errors, "minBaseAmount")} hint="Optional">
                <input id="r-minb" inputMode="decimal" className={inputClass} {...register("minBaseAmount")} />
              </Labelled>
              <Labelled label="Max. eligible base (₹, excl.)" htmlFor="r-maxb" error={errorAt(errors, "maxBaseAmount")} hint="Optional">
                <input id="r-maxb" inputMode="decimal" className={inputClass} {...register("maxBaseAmount")} />
              </Labelled>
              <Labelled label="Cap per commission (₹)" htmlFor="r-cap" error={errorAt(errors, "capAmount")} hint="Optional">
                <input id="r-cap" inputMode="decimal" className={inputClass} {...register("capAmount")} />
              </Labelled>
            </div>
          </fieldset>
        </section>
      </fieldset>
      {!readOnly ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : ruleId ? "Save rule" : "Create rule"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
