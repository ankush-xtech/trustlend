import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, InboxIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_TONES,
  STATUS_LABELS,
  STATUS_TONES,
  type ApplicationStatusValue,
  type StatusTone,
} from "@/lib/domain/labels";

/** Server-safe presentational helpers shared across portals. */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? (
          <Link href={breadcrumb.href} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeftIcon className="size-4" aria-hidden />
            {breadcrumb.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info/10 text-info border-info/20",
  warning: "bg-warning/15 text-[oklch(0.42_0.1_65)] border-warning/30",
  success: "bg-success/10 text-success border-success/25",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
};

export function ToneBadge({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = status as ApplicationStatusValue;
  return <ToneBadge tone={STATUS_TONES[s] ?? "neutral"}>{label ?? STATUS_LABELS[s] ?? status}</ToneBadge>;
}

export function CommissionBadge({ status }: { status: string }) {
  return <ToneBadge tone={COMMISSION_STATUS_TONES[status] ?? "neutral"}>{COMMISSION_STATUS_LABELS[status] ?? status}</ToneBadge>;
}

export function StatCard({ label, value, hint, href, icon }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; icon?: ReactNode }) {
  const body = (
    <div className="flex h-full flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl hover:[&>div]:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground [&_svg]:size-5">{icon ?? <InboxIcon />}</div>
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-xs", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-5">
          <div>
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{i.label}</dt>
          <dd className="mt-0.5 text-sm break-words">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkButton({
  href,
  children,
  variant = "default",
  size = "default",
  className,
  prefetch,
}: {
  href: string;
  children: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "xs";
  className?: string;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </Link>
  );
}

/** Pagination links that preserve the current query string. */
export function PaginationNav({
  page,
  pageCount,
  total,
  basePath,
  searchParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (total === 0) return null;
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v && k !== "page") params.set(k, v);
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2 text-sm">
      <p className="text-muted-foreground">
        Page {page} of {pageCount} · {total} result{total === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href(page - 1)} rel="prev">
            <ChevronLeftIcon aria-hidden /> Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href(page + 1)} rel="next">
            Next <ChevronRightIcon aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** GET filter form: values live in the URL so results are shareable and server-rendered. */
export function FilterBar({ children, basePath }: { children: ReactNode; basePath: string }) {
  return (
    <form method="get" action={basePath} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-xs" role="search">
      {children}
      <button type="submit" className={buttonVariants({ size: "sm" })}>
        Apply
      </button>
      <Link href={basePath} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Reset
      </Link>
    </form>
  );
}

export function FilterInput({ label, name, defaultValue, placeholder, type = "text" }: { label: string; name: string; defaultValue?: string; placeholder?: string; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-8 min-w-[10rem] rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  );
}

export function FilterSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-8 min-w-[9rem] rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function IllustrativeNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-[oklch(0.4_0.09_65)]">
      {children ?? "Illustrative demo content. Not an offer, rate or guarantee from any lender."}
    </p>
  );
}

/** Reads a single string search param. */
export function sp(searchParams: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = searchParams[key];
  return typeof v === "string" && v.length ? v.slice(0, 200) : undefined;
}

export function spPage(searchParams: Record<string, string | string[] | undefined>): number {
  const n = Number(sp(searchParams, "page") ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
