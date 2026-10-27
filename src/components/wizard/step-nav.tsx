"use client";

import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StepNav({ onBack, submitting, nextLabel = "Save & continue", disabled }: { onBack?: () => void; submitting: boolean; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeftIcon aria-hidden /> Previous
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" disabled={submitting || disabled} aria-busy={submitting}>
        {submitting ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
        {nextLabel}
        {!submitting ? <ArrowRightIcon aria-hidden /> : null}
      </Button>
    </div>
  );
}
