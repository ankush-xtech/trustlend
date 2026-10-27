import Link from "next/link";
import { BellIcon } from "lucide-react";
import type { Actor } from "@/server/rbac/actor";
import { listMyNotifications } from "@/server/services/notifications";
import { markAllNotificationsReadAction } from "@/server/actions/common";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "./display";
import { ActionForm, SubmitButton } from "./action-form";

/** In-app notification inbox (the signed-in user's own notifications only). */
export async function NotificationsPage({ actor }: { actor: Actor }) {
  const items = await listMyNotifications(actor, 50);
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your applications and account."
        actions={
          unread ? (
            <ActionForm action={markAllNotificationsReadAction}>
              <SubmitButton variant="outline" size="sm">
                Mark all as read
              </SubmitButton>
            </ActionForm>
          ) : null
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={<BellIcon />} title="No notifications yet" description="We'll let you know when something needs your attention." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {items.map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.readAt && "bg-primary/[0.03]")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !n.readAt && "font-medium")}>
                  {n.linkPath && n.linkPath.startsWith("/") ? (
                    <Link href={n.linkPath} className="hover:underline">
                      {n.subject}
                    </Link>
                  ) : (
                    n.subject
                  )}
                  {!n.readAt ? <span className="sr-only"> (unread)</span> : null}
                </p>
                {n.body ? <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
