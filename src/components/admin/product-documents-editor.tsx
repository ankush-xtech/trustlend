"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { productDocumentsSchema } from "@/lib/validation/product";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/lib/domain/labels";
import { APPLICANT_TYPES, APPLICANT_TYPE_LABELS } from "@/lib/domain/product-config";
import { saveProductDocumentsAction } from "@/server/actions/admin";
import { errorAt, inputClass, Labelled } from "./form-bits";

const schema = z.object({ docs: productDocumentsSchema });
type Input = z.input<typeof schema>;
type Output = z.output<typeof schema>;

export function ProductDocumentsEditor({ productId, initial, readOnly = false }: { productId: string; initial: Input["docs"]; readOnly?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, control, handleSubmit, formState } = useForm<Input, unknown, Output>({ resolver: zodResolver(schema), defaultValues: { docs: initial } });
  const docs = useFieldArray({ control, name: "docs" });
  const errors = formState.errors;

  const onSubmit = handleSubmit((data) =>
    startTransition(async () => {
      const res = await saveProductDocumentsAction(productId, data.docs);
      if (res.status === "success") {
        toast.success(res.message ?? "Saved");
        router.refresh();
      } else toast.error(res.message ?? "Could not save");
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset disabled={readOnly || pending} className="grid gap-3">
        {docs.fields.length === 0 ? <p className="text-sm text-muted-foreground">No document requirements configured.</p> : null}
        {docs.fields.map((f, i) => (
          <div key={f.id} className="grid gap-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Labelled label="Category" htmlFor={`d-cat-${i}`} error={errorAt(errors, `docs.${i}.category`)}>
                <select id={`d-cat-${i}`} className={inputClass} {...register(`docs.${i}.category`)}>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {DOCUMENT_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Labelled>
              <Labelled label="Label shown to applicants" htmlFor={`d-label-${i}`} error={errorAt(errors, `docs.${i}.label`)}>
                <input id={`d-label-${i}`} className={inputClass} {...register(`docs.${i}.label`)} />
              </Labelled>
              <Labelled label="Description" htmlFor={`d-desc-${i}`} error={errorAt(errors, `docs.${i}.description`)}>
                <input id={`d-desc-${i}`} className={inputClass} {...register(`docs.${i}.description`)} />
              </Labelled>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register(`docs.${i}.isRequired`)} />
                Required
              </label>
              <span className="text-muted-foreground">Only for:</span>
              {APPLICANT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input type="checkbox" value={t} className="size-4 accent-[var(--primary)]" {...register(`docs.${i}.applicantTypes`)} />
                  {APPLICANT_TYPE_LABELS[t]}
                </label>
              ))}
              <span className="text-xs text-muted-foreground">(none = all applicants)</span>
              {!readOnly ? (
                <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => docs.remove(i)}>
                  <Trash2Icon /> Remove
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {errorAt(errors, "docs") ? <p className="text-sm text-destructive">{errorAt(errors, "docs")}</p> : null}
      </fieldset>
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => docs.append({ category: "OTHER", label: "", description: "", isRequired: true, applicantTypes: [] })}>
            <PlusIcon /> Add requirement
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save requirements"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
