import Link from "next/link";
import { FileLockIcon, ScrollTextIcon, ShieldCheckIcon } from "lucide-react";
import { BrandMark } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[oklch(0.24_0.05_240)] via-[oklch(0.3_0.07_235)] to-[oklch(0.36_0.08_210)] p-10 text-white lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 size-[30rem] rounded-full bg-[oklch(0.72_0.11_190)] opacity-20 blur-3xl" />
        <Link href="/" aria-label="TrustLend home" className="relative w-fit">
          <BrandMark inverted />
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-bold tracking-tight">Every step of your loan application, in one secure place.</h2>
          <ul className="mt-8 space-y-4 text-sm text-white/80">
            <li className="flex gap-3">
              <FileLockIcon className="size-5 shrink-0 text-[oklch(0.72_0.11_190)]" aria-hidden /> Documents kept in private storage
            </li>
            <li className="flex gap-3">
              <ShieldCheckIcon className="size-5 shrink-0 text-[oklch(0.72_0.11_190)]" aria-hidden /> Role-based access to your information
            </li>
            <li className="flex gap-3">
              <ScrollTextIcon className="size-5 shrink-0 text-[oklch(0.72_0.11_190)]" aria-hidden /> Important actions recorded in an audit trail
            </li>
          </ul>
          <p className="mt-10 text-xs text-white/50">Loan decisions are made by lending partners. Applying does not guarantee approval.</p>
        </div>
      </aside>
      <div className="flex flex-col bg-background">
        <header className="flex h-16 items-center justify-between px-6 lg:justify-end">
          <Link href="/" aria-label="TrustLend home" className="lg:hidden">
            <BrandMark />
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to website
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
