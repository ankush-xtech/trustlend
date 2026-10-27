"use client";

import { useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApplicantTypeValue } from "@/lib/domain/product-config";
import { DocumentUploader } from "@/components/applications/document-uploader";
import type { WizardState } from "./types";

export function StepDocuments({
  state,
  disabled,
  onBack,
  onContinue,
  maxMb,
}: {
  state: WizardState;
  disabled: boolean;
  onBack: () => void;
  onContinue: () => Promise<void>;
  maxMb: number;
}) {
  const [submitting, setSubmitting] = useState(false);
  const applicantType = state.application.applicantType as ApplicantTypeValue | null;
  const requirements = state.documentRequirements.filter(
    (r) => !r.applicantTypes || r.applicantTypes.length === 0 || (applicantType && r.applicantTypes.includes(applicantType)),
  );
  const missing = requirements.filter((r) => r.isRequired && !state.documents.some((d) => d.category === r.category && d.status !== "REJECTED"));

  return (
    <div className="grid gap-5">
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Upload clear scans or photos of each document. Uploading a document does not mean it has been verified — our team reviews every
        document after you submit.
      </div>
      <DocumentUploader
        applicationId={state.application.id}
        requirements={requirements}
        documents={state.documents.map((d) => ({ ...d, canDownload: true }))}
        canUpload={!disabled}
        canRemove={!disabled}
        maxMb={maxMb}
      />
      {missing.length ? (
        <p className="text-sm text-muted-foreground" role="status">
          Still required: {missing.map((m) => m.label).join(", ")}
        </p>
      ) : null}
      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeftIcon aria-hidden /> Previous
        </Button>
        <Button
          type="button"
          disabled={disabled || submitting || missing.length > 0}
          onClick={async () => {
            setSubmitting(true);
            await onContinue();
            setSubmitting(false);
          }}
        >
          {submitting ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          Continue to review <ArrowRightIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
