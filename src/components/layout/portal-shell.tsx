import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftRightIcon, BellIcon, LogOutIcon } from "lucide-react";
import type { Actor } from "@/server/rbac/actor";
import type { Portal } from "@/server/auth/current";
import { countUnread } from "@/server/services/notifications";
import { logoutAction } from "@/server/actions/auth";
import { availablePortals, PORTAL_LABELS, visibleNav } from "./nav-config";
import { MobileNav, NavLinks } from "./nav-links";
import { BrandMark } from "./brand";

const NOTIFICATION_PATH: Record<Portal, string> = {
  customer: "/customer/notifications",
  agent: "/agent/notifications",
  staff: "/staff/notifications",
  admin: "/admin/notifications/inbox",
};

/** Authenticated workspace chrome. Navigation is filtered by the actor's live permissions. */
export async function PortalShell({ portal, actor, children }: { portal: Portal; actor: Actor; children: ReactNode }) {
  const groups = visibleNav(portal, actor.permissions);
  const portals = availablePortals(actor.permissions).filter((p) => p.portal !== portal);
  const unread = await countUnread(actor);
  const initials = actor.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen bg-muted/30">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Link href={`/${portal}`} aria-label="TrustLend home">
            <BrandMark inverted />
          </Link>
        </div>
        <p className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-primary">{PORTAL_LABELS[portal]}</p>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks groups={groups} />
        </div>
        {portals.length ? (
          <div className="border-t border-sidebar-border p-3">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">Switch workspace</p>
            {portals.map((p) => (
              <Link key={p.href} href={p.href} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
                <ArrowLeftRightIcon className="size-3.5" aria-hidden /> {p.label}
              </Link>
            ))}
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <MobileNav groups={groups} portalLabel={PORTAL_LABELS[portal]} portals={portals} />
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={NOTIFICATION_PATH[portal]}
              className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
            >
              <BellIcon className="size-5" aria-hidden />
              {unread ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{actor.name}</p>
              <p className="text-xs leading-tight text-muted-foreground">{actor.email}</p>
            </div>
            <span aria-hidden className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sign out" title="Sign out">
                <LogOutIcon className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
