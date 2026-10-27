"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand";
import { cn } from "@/lib/utils";

export function PublicMobileNav({ items, dashboardHref }: { items: { href: string; label: string }[]; dashboardHref: string | null }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader className="border-b">
          <SheetTitle>
            <BrandMark />
            <span className="sr-only">Menu</span>
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
          {items.map((i) => (
            <Link key={i.href} href={i.href} onClick={close} className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted">
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t p-4">
          {dashboardHref ? (
            <Link href={dashboardHref} onClick={close} className={cn(buttonVariants())}>
              Go to my dashboard
            </Link>
          ) : (
            <>
              <Link href="/register" onClick={close} className={cn(buttonVariants(), "h-10")}>
                Apply now
              </Link>
              <Link href="/login" onClick={close} className={cn(buttonVariants({ variant: "outline" }), "h-10")}>
                Sign in
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
