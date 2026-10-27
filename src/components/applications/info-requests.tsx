"use client";

import { MessageSquareIcon } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { TextAreaField } from "@/components/shared/form-controls";
import { ToneBadge } from "@/components/shared/display";
import { Button } from "@/components/ui/button";
import { respondToRequestAction, resolveRequestAction } from "@/server/actions/applications";
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategoryValue } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export interface InfoRequestItem {
  id: string;
  message: string;
  requestedCategories: string[];
  status: string;
  responseText: string | null;
  respondedAt: Date | string | null;
  createdAt: Date | string;
  resolvedAt: Date | string | null;
}

const TONE = { OPEN: "warning", RESPONDED: "info", RESOLVED: "success", CANCELLED: "neutral" } as const;
const LABEL = { OPEN: "Awaiting response", RESPONDED: "Responded", RESOLVED: "Resolved", CANCELLED: "Cancelled" } as const;

/** Information requests. Applicants can respond to OPEN requests; staff can resolve or cancel. */
export function InfoRequests({ items, mode }: { items: InfoRequestItem[]; mode: "applicant" | "staff" | "readonly" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!items.length) return <p className="text-sm text-muted-foreground">No information requests.</p>;
  return (
    <ul className="grid gap-3">
      {items.map((r) => (
        <li key={r.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <MessageSquareIcon className="size-4 text-muted-foreground" aria-hidden /> Requested {formatDateTime(r.createdAt)}
            </p>
            <ToneBadge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{LABEL[r.status as keyof typeof LABEL] ?? r.status}</ToneBadge>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm">{r.message}</p>
          {r.requestedCategories.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Documents requested: {r.requestedCategories.map((c) => DOCUMENT_CATEGORY_LABELS[c as DocumentCategoryValue] ?? c).join(", ")} — upload them in the Documents section.
            </p>
          ) : null}
          {r.responseText ? (
            <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Response · {formatDateTime(r.respondedAt)}</p>
              <p className="mt-1 whitespace-pre-line">{r.responseText}</p>
            </div>
          ) : null}
          {mode === "applicant" && r.status === "OPEN" ? (
            <ActionForm action={respondToRequestAction.bind(null, r.id)} className="mt-3 grid gap-2" resetOnSuccess>
              <TextAreaField label="Your response" name="responseText" rows={3} required hint="Upload any requested documents before or after responding." />
              <div>
                <SubmitButton size="sm" pendingText="Sending…">
                  Send response
                </SubmitButton>
              </div>
            </ActionForm>
          ) : null}
          {mode === "staff" && (r.status === "OPEN" || r.status === "RESPONDED") ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await resolveRequestAction(r.id, false);
                    if (res.status === "success") toast.success(res.message ?? "Resolved");
                    else toast.error(res.message ?? "Failed");
                    router.refresh();
                  })
                }
              >
                Mark resolved
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await resolveRequestAction(r.id, true);
                    if (res.status === "success") toast.success(res.message ?? "Cancelled");
                    else toast.error(res.message ?? "Failed");
                    router.refresh();
                  })
                }
              >
                Cancel request
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
