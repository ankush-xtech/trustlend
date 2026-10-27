import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, CheckCircle2Icon } from "lucide-react";
import { formatMoney, formatTenure } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function PageIntro({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b bg-gradient-to-b from-secondary/70 to-background">
      <Container className="py-14 sm:py-20">
        {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wider text-brand">{eyebrow}</p> : null}
        <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {description ? <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p> : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </Container>
    </section>
  );
}

export const WIZARD_STEPS = [
  { title: "Personal information", description: "Your name, date of birth and contact details. Signed-in customers start with their profile pre-filled." },
  { title: "Address & references", description: "Current and permanent address, plus two personal references who have agreed to be contacted." },
  { title: "Employment or business", description: "Only the fields relevant to you: employment details if salaried, business details if self-employed." },
  { title: "Loan requirement", description: "The amount you want to request, its purpose and your preferred repayment tenure." },
  { title: "Document upload", description: "Upload the documents the product requires. Files are stored privately and reviewed by our team." },
];

export function StepsList({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={cn("grid gap-4", compact ? "sm:grid-cols-2 lg:grid-cols-5" : "md:grid-cols-2")}>
      {WIZARD_STEPS.map((s, i) => (
        <li key={s.title} className="relative rounded-xl border bg-card p-5 shadow-xs">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
            {i + 1}
          </span>
          <h3 className="mt-3 font-semibold">
            <span className="sr-only">Step {i + 1}: </span>
            {s.title}
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{s.description}</p>
        </li>
      ))}
    </ol>
  );
}

export interface PublicProduct {
  slug: string;
  name: string;
  shortDescription: string;
  currency: string;
  minAmount: string;
  maxAmount: string;
  isIllustrative: boolean;
  config: { tenureOptionsMonths: number[] };
}

export function ProductCard({ product }: { product: PublicProduct }) {
  const tenures = [...product.config.tenureOptionsMonths].sort((a, b) => a - b);
  return (
    <article className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold">{product.name}</h3>
        {product.isIllustrative ? (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-[oklch(0.4_0.09_65)]">Illustrative</span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.shortDescription}</p>
      <dl className="mt-5 grid grid-cols-2 gap-4 rounded-xl bg-muted/60 p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Request between</dt>
          <dd className="mt-0.5 font-medium">
            {formatMoney(product.minAmount, product.currency)} – {formatMoney(product.maxAmount, product.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tenure options</dt>
          <dd className="mt-0.5 font-medium">
            {tenures.length ? `${formatTenure(tenures[0])} – ${formatTenure(tenures[tenures.length - 1])}` : "—"}
          </dd>
        </div>
      </dl>
      <div className="mt-auto pt-6">
        <Link
          href={`/loans/${product.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          View details and requirements <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export function CheckList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-6">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function DisclaimerNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground">{children}</p>;
}
