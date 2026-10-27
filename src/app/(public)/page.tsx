import Link from "next/link";
import { ArrowRightIcon, EyeIcon, FileLockIcon, ListChecksIcon, ScrollTextIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { LinkButton } from "@/components/shared/display";
import { Container, ProductCard, StepsList } from "@/components/public/marketing";
import { FAQ_GROUPS } from "@/components/public/faq-data";
import { listActiveProducts } from "@/server/services/products";
import { getCurrentActor } from "@/server/auth/current";

export const dynamic = "force-dynamic";

const TRUST_POINTS = [
  { icon: FileLockIcon, title: "Private document storage", body: "Uploaded documents are stored privately and opened only through short-lived, access-checked links." },
  { icon: ShieldCheckIcon, title: "Role-based access", body: "Staff see only the applications assigned to them. Agents see only the customers they referred." },
  { icon: ScrollTextIcon, title: "Full audit trail", body: "Status changes, document reviews and decisions are recorded with who did what and when." },
  { icon: EyeIcon, title: "Transparent status", body: "Follow every stage in plain language and respond to requests directly from your dashboard." },
];

export default async function HomePage() {
  const [products, actor] = await Promise.all([listActiveProducts(), getCurrentActor()]);
  const applyHref = actor?.permissions.has("portal.customer") ? "/customer/apply" : "/register";
  const faqTeaser = FAQ_GROUPS.flatMap((g) => g.items).slice(0, 4);

  return (
    <>
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-[oklch(0.25_0.05_240)] via-[oklch(0.3_0.07_235)] to-[oklch(0.36_0.08_210)] text-white">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full bg-[oklch(0.72_0.11_190)] opacity-20 blur-3xl" />
        <Container className="relative grid gap-12 py-20 sm:py-28 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
              Home and business loan applications
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Apply for a loan with clarity at every step.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/80">
              Prepare a complete application in five guided steps, upload documents securely and follow its progress with lending partners — all in one
              place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={applyHref} size="lg" className="h-11 bg-[oklch(0.72_0.11_190)] px-5 text-[oklch(0.2_0.04_245)] hover:bg-[oklch(0.78_0.1_190)]">
                Start your application <ArrowRightIcon aria-hidden />
              </LinkButton>
              <LinkButton href="/how-it-works" size="lg" variant="outline" className="h-11 border-white/30 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white">
                See how it works
              </LinkButton>
            </div>
            <p className="mt-6 text-xs text-white/60">
              TrustLend facilitates applications. Loan decisions, rates and terms are set by lending partners. Applying does not guarantee approval.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <p className="text-sm font-semibold text-white/90">Your application, step by step</p>
            <ol className="mt-4 space-y-3">
              {["Personal information", "Address & references", "Employment or business", "Loan requirement", "Document upload"].map((s, i) => (
                <li key={s} className="flex items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[oklch(0.72_0.11_190)] text-xs font-semibold text-[oklch(0.2_0.04_245)]">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-white/60">Save a draft at any step and resume later.</p>
          </div>
        </Container>
      </section>

      <section aria-labelledby="how-heading" className="py-16 sm:py-20">
        <Container>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
            <h2 id="how-heading" className="mt-2 text-3xl font-bold tracking-tight">Five guided steps to a complete application</h2>
            <p className="mt-3 text-muted-foreground">
              Each step asks only for what your chosen product needs. We check everything on our servers before your application moves forward.
            </p>
          </div>
          <div className="mt-10">
            <StepsList compact />
          </div>
        </Container>
      </section>

      <section aria-labelledby="products-heading" className="border-y bg-muted/40 py-16 sm:py-20">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-brand">Loan products</p>
              <h2 id="products-heading" className="mt-2 text-3xl font-bold tracking-tight">Find the product that fits your plans</h2>
            </div>
            <Link href="/loans" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              All products <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
          {products.length ? (
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {products.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          ) : (
            <p className="mt-10 rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">
              No loan products are open for applications right now. Please check back soon.
            </p>
          )}
          <p className="mt-6 text-xs text-muted-foreground">Displaying a loan product does not guarantee eligibility or approval.</p>
        </Container>
      </section>

      <section aria-labelledby="trust-heading" className="py-16 sm:py-20">
        <Container>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">Security & transparency</p>
            <h2 id="trust-heading" className="mt-2 text-3xl font-bold tracking-tight">Built to handle sensitive information carefully</h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border bg-card p-5 shadow-xs">
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-6 rounded-2xl border bg-secondary/50 p-6 sm:grid-cols-2 sm:p-8">
            <div className="flex gap-4">
              <UsersIcon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="font-semibold">Working with an agent?</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Authorised agents can refer you and help prepare your application. They see only the applications they referred.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <ListChecksIcon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="font-semibold">Clear requests, no surprises</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  If anything is missing, you get a specific request and can respond or re-upload directly from your dashboard.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section aria-labelledby="faq-heading" className="border-t bg-muted/40 py-16 sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">FAQ</p>
            <h2 id="faq-heading" className="mt-2 text-3xl font-bold tracking-tight">Common questions</h2>
            <p className="mt-3 text-muted-foreground">Everything about documents, statuses, references and security.</p>
            <Link href="/faq" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              Read all FAQs <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="divide-y rounded-2xl border bg-card shadow-xs">
            {faqTeaser.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden focus-visible:outline-2 focus-visible:outline-ring">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="flex flex-col items-start gap-6 rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to start?</h2>
              <p className="mt-2 max-w-xl text-primary-foreground/80">Create an account, choose a product and save your progress as you go.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href={applyHref} size="lg" variant="secondary" className="h-11 px-5">
                Start your application
              </LinkButton>
              <LinkButton href="/contact" size="lg" variant="outline" className="h-11 border-white/30 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white">
                Talk to us
              </LinkButton>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
