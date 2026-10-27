import { cn } from "@/lib/utils";

export function BrandMark({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill={inverted ? "oklch(0.72 0.11 190)" : "oklch(0.38 0.09 235)"} />
        <path d="M9 11h14M16 11v12" stroke={inverted ? "oklch(0.2 0.04 245)" : "white"} strokeWidth="3" strokeLinecap="round" />
        <path d="M20 19.5l2.5 2.5 4-5" stroke={inverted ? "oklch(0.2 0.04 245)" : "oklch(0.75 0.12 185)"} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cn("font-heading text-lg", inverted ? "text-sidebar-foreground" : "text-foreground")} style={{ fontFamily: "var(--font-jakarta)" }}>
        TrustLend
      </span>
    </span>
  );
}
