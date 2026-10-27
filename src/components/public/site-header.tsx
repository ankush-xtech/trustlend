import Link from "next/link";
import { BrandMark } from "@/components/layout/brand";
import { LinkButton } from "@/components/shared/display";
import { getCurrentActor, homePathFor } from "@/server/auth/current";
import { PublicMobileNav } from "./mobile-nav";

export const PUBLIC_NAV = [
  { href: "/loans", label: "Loans" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export async function SiteHeader() {
  const actor = await getCurrentActor();
  const home = actor ? homePathFor(actor) : null;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="TrustLend home" className="rounded-md focus-visible:outline-2 focus-visible:outline-ring">
          <BrandMark />
        </Link>
        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 md:flex">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {home ? (
            <LinkButton href={home}>Go to my dashboard</LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost">
                Sign in
              </LinkButton>
              <LinkButton href="/register">Apply now</LinkButton>
            </>
          )}
        </div>
        <div className="ml-auto md:hidden">
          <PublicMobileNav items={[...PUBLIC_NAV]} dashboardHref={home} />
        </div>
      </div>
    </header>
  );
}
