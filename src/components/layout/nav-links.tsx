"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRightIcon,
  BellIcon,
  ChartColumnIcon,
  FileCheck2Icon,
  FileTextIcon,
  GitBranchIcon,
  HandshakeIcon,
  HistoryIcon,
  InboxIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MailIcon,
  MenuIcon,
  PackageIcon,
  PlusCircleIcon,
  ReceiptIcon,
  ScaleIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  UserPlusIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavGroup, NavIcon } from "./nav-config";
import { BrandMark } from "./brand";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboardIcon,
  file: FileTextIcon,
  plus: PlusCircleIcon,
  bell: BellIcon,
  user: UserIcon,
  users: UsersIcon,
  handshake: HandshakeIcon,
  tasks: ListChecksIcon,
  wallet: WalletIcon,
  inbox: InboxIcon,
  history: HistoryIcon,
  shield: ShieldCheckIcon,
  key: KeyRoundIcon,
  package: PackageIcon,
  chart: ChartColumnIcon,
  scroll: ScrollTextIcon,
  settings: SettingsIcon,
  mail: MailIcon,
  workflow: GitBranchIcon,
  assign: UserPlusIcon,
  documents: FileCheck2Icon,
  receipt: ReceiptIcon,
  rules: ScaleIcon,
};

export function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {g.label ? <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{g.label}</p> : null}
          {g.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/60")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function MobileNav({ groups, portalLabel, portals }: { groups: NavGroup[]; portalLabel: string; portals: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="border-b border-sidebar-border px-4 py-4">
          <SheetTitle className="text-sidebar-foreground">
            <BrandMark inverted />
            <span className="sr-only">{portalLabel} navigation</span>
          </SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-3 py-4">
          <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
          {portals.length > 1 ? (
            <div className="mt-6 border-t border-sidebar-border pt-4">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">Switch workspace</p>
              {portals.map((p) => (
                <Link key={p.href} href={p.href} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
                  <ArrowLeftRightIcon className="size-4" /> {p.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
