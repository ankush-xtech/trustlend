"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, FileIcon, Loader2Icon, ShieldAlertIcon, Trash2Icon, UploadIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_STATUS_LABELS, SCAN_STATUS_LABELS, type DocumentCategoryValue } from "@/lib/domain/labels";
import { formatBytes, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { removeDocumentAction } from "@/server/actions/applications";

export interface UploaderRequirement {
  category: string;
  label: string;
  description?: string;
  isRequired: boolean;
}

export interface UploaderDocument {
  id: string;
  category: string;
  originalFilename: string;
  sizeBytes: number;
  status: string;
  scanStatus: string;
  uploadedAt: Date | string;
  rejectionReason: string | null;
  canDownload?: boolean;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

function StatusIcon({ status }: { status: string }) {
  if (status === "VERIFIED") return <CheckCircle2Icon className="size-4 text-success" aria-hidden />;
  if (status === "REJECTED") return <XCircleIcon className="size-4 text-destructive" aria-hidden />;
  return <FileIcon className="size-4 text-muted-foreground" aria-hidden />;
}

/**
 * Upload / replace / remove documents per requirement. Files go to the upload Route Handler where the
 * server validates type (by signature), size and scan result; client checks here are only for convenience.
 */
export function DocumentUploader({
  applicationId,
  requirements,
  documents,
  canUpload,
  canRemove,
  maxMb,
}: {
  applicationId: string;
  requirements: UploaderRequirement[];
  documents: UploaderDocument[];
  canUpload: boolean;
  canRemove: boolean;
  maxMb: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const extraCategories = [...new Set(documents.map((d) => d.category))].filter((c) => !requirements.some((r) => r.category === c));
  const rows: UploaderRequirement[] = [
    ...requirements,
    ...extraCategories.map((c) => ({ category: c, label: DOCUMENT_CATEGORY_LABELS[c as DocumentCategoryValue] ?? c, isRequired: false })),
  ];

  async function upload(category: string, file: File, replacesDocumentId?: string) {
    setErrors((e) => ({ ...e, [category]: "" }));
    if (file.size > maxMb * 1024 * 1024) {
      setErrors((e) => ({ ...e, [category]: `Files must be ${maxMb} MB or smaller.` }));
      return;
    }
    setBusy(category);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("category", category);
      if (replacesDocumentId) body.set("replacesDocumentId", replacesDocumentId);
      const res = await fetch(`/api/applications/${applicationId}/documents`, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; fieldErrors?: Record<string, string[]> } };
      if (!res.ok) {
        const msg = json.error?.fieldErrors?.file?.[0] ?? json.error?.fieldErrors?.category?.[0] ?? json.error?.message ?? "Upload failed.";
        setErrors((e) => ({ ...e, [category]: msg }));
        return;
      }
      toast.success(`${file.name} uploaded`);
      startTransition(() => router.refresh());
    } catch {
      setErrors((e) => ({ ...e, [category]: "Upload failed. Check your connection and try again." }));
    } finally {
      setBusy(null);
      const input = inputs.current[category];
      if (input) input.value = "";
    }
  }

  async function remove(doc: UploaderDocument) {
    setBusy(doc.id);
    const result = await removeDocumentAction(doc.id);
    setBusy(null);
    if (result.status === "error") toast.error(result.message ?? "Could not remove the document.");
    else {
      toast.success("Document removed");
      startTransition(() => router.refresh());
    }
  }

  return (
    <ul className="grid gap-3">
      {rows.map((req) => {
        const docs = documents.filter((d) => d.category === req.category);
        const rejected = docs.filter((d) => d.status === "REJECTED");
        const hasUsable = docs.some((d) => d.status !== "REJECTED");
        const inputId = `upload-${req.category}`;
        return (
          <li key={req.category} className={cn("rounded-xl border bg-card p-4", req.isRequired && !hasUsable && "border-warning/50")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {req.label}
                  {req.isRequired ? <span className="ml-1.5 text-xs font-normal text-destructive">Required</span> : <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>}
                </p>
                {req.description ? <p className="text-sm text-muted-foreground">{req.description}</p> : null}
              </div>
              {canUpload ? (
                <div>
                  <input
                    id={inputId}
                    ref={(el) => {
                      inputs.current[req.category] = el;
                    }}
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    disabled={busy !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(req.category, f, rejected[0]?.id);
                    }}
                    data-testid={`file-${req.category}`}
                  />
                  <label
                    htmlFor={inputId}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted focus-within:ring-3 focus-within:ring-ring/50",
                      busy !== null && "pointer-events-none opacity-60",
                    )}
                  >
                    {busy === req.category ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : <UploadIcon className="size-4" aria-hidden />}
                    {rejected.length ? "Upload replacement" : docs.length ? "Add another file" : "Upload file"}
                  </label>
                </div>
              ) : null}
            </div>
            {errors[req.category] ? (
              <p className="mt-2 text-sm font-medium text-destructive" role="alert">
                {errors[req.category]}
              </p>
            ) : null}
            {docs.length ? (
              <ul className="mt-3 grid gap-2">
                {docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <StatusIcon status={d.status} />
                    <span className="min-w-0 flex-1 truncate font-medium" title={d.originalFilename}>
                      {d.canDownload ? (
                        <a href={`/api/documents/${d.id}/download`} className="hover:underline">
                          {d.originalFilename}
                        </a>
                      ) : (
                        d.originalFilename
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatBytes(d.sizeBytes)}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(d.uploadedAt)}</span>
                    <span className={cn("text-xs font-medium", d.status === "VERIFIED" ? "text-success" : d.status === "REJECTED" ? "text-destructive" : "text-muted-foreground")}>
                      {DOCUMENT_STATUS_LABELS[d.status] ?? d.status}
                    </span>
                    {d.scanStatus !== "CLEAN" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={SCAN_STATUS_LABELS[d.scanStatus]}>
                        <ShieldAlertIcon className="size-3.5" aria-hidden /> {SCAN_STATUS_LABELS[d.scanStatus]}
                      </span>
                    ) : null}
                    {canRemove && d.status === "PENDING_REVIEW" ? (
                      <Button type="button" variant="ghost" size="xs" onClick={() => void remove(d)} disabled={busy !== null} aria-label={`Remove ${d.originalFilename}`}>
                        {busy === d.id ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Remove
                      </Button>
                    ) : null}
                    {d.status === "REJECTED" && d.rejectionReason ? <p className="w-full text-xs text-destructive">Reason: {d.rejectionReason}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
      <li className="text-xs text-muted-foreground">
        Accepted formats: PDF, PNG, JPEG · up to {maxMb} MB per file. Files are stored privately and are only visible to you and authorised TrustLend staff.
      </li>
    </ul>
  );
}
