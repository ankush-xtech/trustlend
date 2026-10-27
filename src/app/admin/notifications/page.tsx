import Link from "next/link";
import { MailIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listNotificationLog } from "@/server/services/notifications";
import { retryNotificationAction } from "@/server/actions/admin";
import { EmptyState, FilterBar, FilterInput, FilterSelect, PageHeader, PaginationNav, ToneBadge, sp, spPage } from "@/components/shared/display";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { SearchParams } from "@/components/admin/server-utils";

export const metadata = { title: "Notification logs" };

const TONE = { PENDING: "info", SENDING: "info", SENT: "success", FAILED: "danger", CANCELLED: "neutral" } as const;

export default async function NotificationLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePagePermission("admin", "notifications.read_all");
  const params = await searchParams;
  const result = await listNotificationLog(actor, {
    status: sp(params, "status"),
    channel: sp(params, "channel"),
    q: sp(params, "q"),
    page: spPage(params),
  });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <>
      <PageHeader
        title="Notification logs"
        description="Delivery status of transactional emails and in-app notifications. Emails are sent from an outbox in the background so slow providers never block business transactions."
        actions={<Link href="/admin/notifications/inbox" className="text-sm text-primary hover:underline">My inbox</Link>}
      />
      {result.delivers ? (
        <p className="mb-4 rounded-lg border bg-card px-3 py-2 text-sm">Email provider: <strong>{result.provider}</strong> (real delivery).</p>
      ) : (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          Email provider: <strong>{result.provider}</strong>. This is a development mailbox — emails marked “sent” were written locally and were <strong>NOT delivered</strong>. View them at{" "}
          <Link href="/dev/mailbox" className="underline">/dev/mailbox</Link>. Configure EMAIL_PROVIDER=resend for real delivery.
        </p>
      )}
      <FilterBar basePath="/admin/notifications">
        <FilterInput label="Recipient or template" name="q" defaultValue={sp(params, "q")} />
        <FilterSelect label="Status" name="status" defaultValue={sp(params, "status")} options={["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"].map((s) => ({ value: s, label: s.toLowerCase() }))} />
        <FilterSelect label="Channel" name="channel" defaultValue={sp(params, "channel")} options={[{ value: "EMAIL", label: "Email" }, { value: "IN_APP", label: "In-app" }]} />
      </FilterBar>
      {result.rows.length === 0 ? (
        <EmptyState icon={<MailIcon />} title="No notifications match" />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Template / subject</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="text-xs">{formatDateTime(n.createdAt)}</TableCell>
                  <TableCell className="text-xs">{n.channel === "IN_APP" ? "In-app" : "Email"}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    <code className="text-xs">{n.template}</code>
                    <div className="text-xs text-muted-foreground">{n.subject}</div>
                    {n.lastError ? <div className="text-xs text-destructive">{n.lastError}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">{n.toEmail ?? "—"}</TableCell>
                  <TableCell>
                    <ToneBadge tone={TONE[n.status]}>{n.status.toLowerCase()}</ToneBadge>
                    {n.sentAt ? <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.sentAt)}</div> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{n.attempts}</TableCell>
                  <TableCell>
                    {n.status === "FAILED" ? (
                      <ConfirmAction action={retryNotificationAction} trigger="Retry" title="Retry this email?" description="It is re-queued with the same idempotency key, so the provider will not deliver it twice." fields={{ notificationId: n.id }} confirmLabel="Retry" />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationNav page={result.page} pageCount={pageCount} total={result.total} basePath="/admin/notifications" searchParams={params} />
    </>
  );
}
