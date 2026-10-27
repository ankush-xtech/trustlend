import Link from "next/link";
import { BrandMark } from "@/components/layout/brand";

const COLUMNS = [
  {
    title: "Loans",
    links: [
      { href: "/loans", label: "All loan products" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/register", label: "Start an application" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About TrustLend" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms and conditions" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-[oklch(0.22_0.04_245)] text-[oklch(0.85_0.01_240)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <BrandMark inverted />
          <p className="max-w-xs text-sm leading-6 text-[oklch(0.75_0.015_240)]">
            A clear, secure way to prepare loan applications, share documents and follow every step with lending partners.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[oklch(0.72_0.11_190)]">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white focus-visible:outline-2 focus-visible:outline-[oklch(0.72_0.11_190)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-[oklch(0.7_0.015_240)] sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>
            TrustLend is a loan application facilitation platform; loan decisions are made by lending partners. Displaying a loan product does not
            guarantee eligibility or approval.
          </p>
          <p className="shrink-0">© {new Date().getFullYear()} TrustLend</p>
        </div>
      </div>
    </footer>
  );
}
