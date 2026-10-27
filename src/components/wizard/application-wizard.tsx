"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { completeDocumentsStepAction, saveStepAction, submitApplicationAction } from "@/server/actions/applications";
import { IllustrativeNotice } from "@/components/shared/display";
import { StepPersonal } from "./step-personal";
import { StepAddress } from "./step-address";
import { StepEmployment } from "./step-employment";
import { StepLoan } from "./step-loan";
import { StepDocuments } from "./step-documents";
import { StepReview } from "./step-review";
import type { WizardState } from "./types";

const STEPS = [
  { n: 1, title: "Personal", long: "Personal information" },
  { n: 2, title: "Address", long: "Address & references" },
  { n: 3, title: "Income", long: "Employment / business" },
  { n: 4, title: "Loan", long: "Loan requirement" },
  { n: 5, title: "Documents", long: "Document upload" },
  { n: 6, title: "Review", long: "Review & submit" },
] as const;

function firstIncomplete(completed: number[]): number {
  for (let s = 1; s <= 5; s++) if (!completed.includes(s)) return s;
  return 6;
}

export function ApplicationWizard({ state: serverState, detailHref, maxMb }: { state: WizardState; detailHref: string; maxMb: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Applicant type chosen in step 3 is applied immediately (not after the background refresh), so later
  // steps never remount and lose what the user is typing.
  const [localApplicantType, setLocalApplicantType] = useState<string | null>(null);
  const state: WizardState = localApplicantType
    ? { ...serverState, application: { ...serverState.application, applicantType: localApplicantType as WizardState["application"]["applicantType"] } }
    : serverState;
  // Local progress from the latest save wins until a newer server state arrives (router.refresh()).
  const [local, setLocal] = useState<{ version: number; completed: number[] } | null>(null);
  const fresh = local && local.version >= state.application.version ? local : null;
  const version = fresh ? fresh.version : state.application.version;
  const completed = fresh ? fresh.completed : state.application.completedSteps;
  const [step, setStep] = useState<number>(() => firstIncomplete(state.application.completedSteps));
  const disabled = !state.editable;

  useEffect(() => {
    document.getElementById("wizard-step-heading")?.focus();
  }, [step]);

  const canOpen = (s: number) => s === 1 || completed.includes(s - 1) || s <= firstIncomplete(completed);

  async function save(s: 1 | 2 | 3 | 4, data: unknown) {
    const result = await saveStepAction(state.application.id, s, version, data);
    if (result.status === "success") {
      if (s === 3) setLocalApplicantType((data as { applicantType: string }).applicantType);
      setLocal({ version: Number(result.data?.version), completed: (result.data?.completedSteps as number[]) ?? completed });
      startTransition(() => router.refresh());
      setStep(s + 1);
      return { ok: true };
    }
    toast.error(result.message ?? "Could not save this step.");
    if (result.message?.includes("changed by someone else")) startTransition(() => router.refresh());
    return { ok: false, fieldErrors: result.fieldErrors };
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Application steps" className="lg:sticky lg:top-24 lg:self-start">
        <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
          {STEPS.map((s) => {
            const done = s.n <= 5 ? completed.includes(s.n) : false;
            const current = step === s.n;
            const enabled = canOpen(s.n);
            return (
              <li key={s.n} className="shrink-0">
                <button
                  type="button"
                  onClick={() => enabled && setStep(s.n)}
                  disabled={!enabled}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    current ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      done ? "border-success bg-success text-white" : current ? "border-primary text-primary" : "border-border text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {done ? <CheckIcon className="size-3.5" /> : s.n}
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="lg:hidden">{s.title}</span>
                    <span className="hidden lg:inline">{s.long}</span>
                    {done ? <span className="sr-only"> (completed)</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 hidden h-1.5 overflow-hidden rounded-full bg-muted lg:block" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${(completed.filter((c) => c <= 5).length / 5) * 100}%` }} />
        </div>
        <p className="mt-2 hidden text-xs text-muted-foreground lg:block">
          {completed.filter((c) => c <= 5).length} of 5 steps complete. Progress is saved each time you continue.
        </p>
      </nav>

      <div className="min-w-0">
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Step {Math.min(step, 6)} of 6 · {state.product.name} · {state.application.reference}
          </p>
          <h2 id="wizard-step-heading" tabIndex={-1} className="text-xl font-semibold outline-none">
            {STEPS[step - 1].long}
          </h2>
          {state.product.isIllustrative && step === 1 ? (
            <div className="mt-2">
              <IllustrativeNotice>This loan product is illustrative demo content configured for development.</IllustrativeNotice>
            </div>
          ) : null}
          {disabled ? (
            <p className="mt-2 rounded-lg border bg-muted px-3 py-2 text-sm">This application has been submitted and can no longer be edited.</p>
          ) : null}
        </div>

        {step === 1 ? <StepPersonal state={state} version={version} disabled={disabled} save={save} /> : null}
        {step === 2 ? <StepAddress state={state} version={version} disabled={disabled} save={save} onBack={() => setStep(1)} /> : null}
        {step === 3 ? <StepEmployment state={state} version={version} disabled={disabled} save={save} onBack={() => setStep(2)} /> : null}
        {step === 4 ? <StepLoan state={state} version={version} disabled={disabled} save={save} onBack={() => setStep(3)} /> : null}
        {step === 5 ? (
          <StepDocuments
            state={state}
            disabled={disabled}
            maxMb={maxMb}
            onBack={() => setStep(4)}
            onContinue={async () => {
              const result = await completeDocumentsStepAction(state.application.id, version);
              if (result.status === "success") {
                setLocal({ version: Number(result.data?.version), completed: [...new Set([...completed, 5])] });
                setStep(6);
                startTransition(() => router.refresh());
              } else toast.error(result.message ?? "Please upload the required documents.");
            }}
          />
        ) : null}
        {step === 6 ? (
          <StepReview
            state={state}
            disabled={disabled}
            onBack={() => setStep(5)}
            onEdit={(s) => setStep(s)}
            onSubmit={async (accepted) => {
              const result = await submitApplicationAction(state.application.id, version, accepted);
              if (result.status === "success") {
                toast.success(result.message ?? "Application submitted");
                router.replace(`${detailHref}?submitted=1`);
                return true;
              }
              toast.error(result.message ?? "Could not submit the application.");
              return false;
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
