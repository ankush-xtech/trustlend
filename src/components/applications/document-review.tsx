"use client";

import { useState } from "react";
import { CheckIcon, DownloadIcon, ExternalLinkIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { TextField } from "@/components/shared/form-controls";
import { ToneBadge } from "@/components/shared/display";
import { Button } from "@/components/ui/button";
import { reviewDocumentAction } from "@/server/actions/applications";
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_STATUS_LABELS, SCAN_STATUS_LABELS, type DocumentCategoryValue } from "@/lib/domain/labels";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { UploaderDocument } from "./document-uploader";

const TONE: Record<string, "neutral" | "success" | "danger" | "warning"> = { PENDING_REVIEW: "warning", VERIFIED: "success", REJECTED: "danger" };

/**
 * Staff document review. Verification is an explicit human decision; it does not certify authenticity
 * beyond that review. Documents that failed malware scanning cannot be opened or verified.
 */
export function DocumentReview({ documents, canReview }: { documents: (UploaderDocument & { mimeType?: string })[]; canReview: boolean }) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  if (!documents.length) return <p className="text-sm text-muted-foreground">No documents uploaded.</p>;
  return (
    <ul className="grid gap-3">
      {documents.map((d) => (
        <li key={d.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{DOCUMENT_CATEGORY_LABELS[d.category as DocumentCategoryValue] ?? d.category}</p>
              <p className="truncate font-medium" title={d.originalFilename}>
                {d.originalFilename}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(d.sizeBytes)} · uploaded {formatDateTime(d.uploadedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge tone={TONE[d.status] ?? "neutral"}>{DOCUMENT_STATUS_LABELS[d.status] ?? d.status}</ToneBadge>
              <ToneBadge tone={d.scanStatus === "CLEAN" ? "success" : d.scanStatus === "INFECTED" ? "danger" : "warning"}>
                {d.scanStatus !== "CLEAN" ? <ShieldAlertIcon className="size-3" aria-hidden /> : null}
                {SCAN_STATUS_LABELS[d.scanStatus] ?? d.scanStatus}
              </ToneBadge>
            </div>
          </div>
          {d.rejectionReason ? <p className="mt-2 text-sm text-destructive">Rejection reason: {d.rejectionReason}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {d.canDownload && d.scanStatus !== "INFECTED" ? (
              <>
                <a href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted">
                  <ExternalLinkIcon className="size-3.5" aria-hidden /> View
                </a>
                <a href={`/api/documents/${d.id}/download`} className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted">
                  <DownloadIcon className="size-3.5" aria-hidden /> Download
                </a>
              </>
            ) : null}
            {canReview && d.status !== "VERIFIED" && d.scanStatus !== "INFECTED" ? (
              <ActionForm action={reviewDocumentAction.bind(null, d.id)}>
                <input type="hidden" name="decision" value="VERIFIED" />
                <SubmitButton size="sm" variant="secondary">
                  <CheckIcon aria-hidden /> Verify
                </SubmitButton>
              </ActionForm>
            ) : null}
            {canReview && d.status !== "REJECTED" ? (
              <Button size="sm" variant="ghost" onClick={() => setRejecting(rejecting === d.id ? null : d.id)}>
                <XIcon aria-hidden /> Reject
              </Button>
            ) : null}
          </div>
          {rejecting === d.id ? (
            <ActionForm action={reviewDocumentAction.bind(null, d.id)} className="mt-3 grid gap-2 rounded-lg border border-dashed p-3" onSuccess={() => setRejecting(null)}>
              <input type="hidden" name="decision" value="REJECTED" />
              <TextField label="Reason (shown to the applicant)" name="rejectionReason" required placeholder="e.g. The image is blurred; please upload a clear scan" />
              <TextField label="Internal note (optional)" name="notes" />
              <div>
                <SubmitButton size="sm" variant="destructive">
                  Reject document
                </SubmitButton>
              </div>
            </ActionForm>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
