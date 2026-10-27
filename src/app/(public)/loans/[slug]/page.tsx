import { notFound } from "next/navigation";
import { FileTextIcon, InfoIcon } from "lucide-react";
import { IllustrativeNotice, LinkButton } from "@/components/shared/display";
import { CheckList, Container, DisclaimerNote, PageIntro } from "@/components/public/marketing";
import { getActiveProductBySlug, listActiveProducts } from "@/server/services/products";
import { getCurrentActor } from "@/server/auth/current";
import { APPLICANT_TYPE_LABELS } from "@/lib/domain/product-config";
import { formatMoney, formatTenure } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/loans/[slug]">) {
  const { slug } = await params;
  const products = await listActiveProducts();
  const p = products.find((x) => x.slug === slug);
  return { title: p ? p.name : "Loan product" };
}

export default async function LoanDetailPage({ params }: PageProps<"/loans/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const [data, actor] = await Promise.all([getActiveProductBySlug(slug), getCurrentActor()]);
  if (!data) notFound();
  const { product, documents } = data;
  const config = product.config;
  const applyHref = actor?.permissions.has("portal.customer") ? "/customer/apply" : "/register";
  const tenures = [...config.tenureOptionsMonths].sort((a, b) => a - b);

  return (
    <>
      <PageIntro eyebrow="Loan product" title={product.name} description={product.shortDescription}>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={applyHref} size="lg" className="h-11 px-5">
            Apply now
          </LinkButton>
          <LinkButton href="/loans" size="lg" variant="outline" className="h-11 px-5">
            All products
          </LinkButton>
        </div>
      </PageIntro>
      <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-10">
          {product.isIllustrative ? <IllustrativeNotice>Illustrative demo product. Not an offer from any lender.</IllustrativeNotice> : null}
          {product.description ? (
            <section aria-labelledby="about-product">
              <h2 id="about-product" className="text-xl font-semibold">
                About this product
              </h2>
              <p className="mt-3 whitespace-pre-line leading-7 text-muted-foreground">{product.description}</p>
            </section>
          ) : null}

          <section aria-labelledby="docs-heading">
            <h2 id="docs-heading" className="text-xl font-semibold">
              Documents you will need
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Accepted formats: PDF, PNG or JPEG. Some documents depend on how you earn your income.</p>
            {documents.length ? (
              <ul className="mt-4 divide-y rounded-xl border bg-card">
                {documents.map((d) => (
                  <li key={d.id} className="flex gap-3 px-4 py-3">
                    <FileTextIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {d.label}{" "}
                        <span className="font-normal text-muted-foreground">{d.isRequired ? "(required)" : "(optional)"}</span>
                      </p>
                      {d.description ? <p className="text-sm text-muted-foreground">{d.description}</p> : null}
                      {d.applicantTypes && d.applicantTypes.length ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">For: {d.applicantTypes.map((t) => APPLICANT_TYPE_LABELS[t]).join(", ")}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Document requirements will be shown during your application.</p>
            )}
          </section>

          {config.eligibilityNotes.length ? (
            <section aria-labelledby="elig-heading" className="rounded-xl border bg-secondary/40 p-5">
              <h2 id="elig-heading" className="flex items-center gap-2 text-lg font-semibold">
                <InfoIcon className="size-5 text-primary" aria-hidden /> Eligibility notes
              </h2>
              <p className="mt-1 text-xs font-medium text-muted-foreground">Informational only – final eligibility is decided by the lending partner.</p>
              <div className="mt-4">
                <CheckList items={config.eligibilityNotes} />
              </div>
            </section>
          ) : null}
        </div>

        <aside aria-label="Product summary" className="h-fit space-y-4 rounded-2xl border bg-card p-6 shadow-xs lg:sticky lg:top-24">
          <h2 className="font-semibold">At a glance</h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Amount you can request</dt>
              <dd className="mt-1 font-medium">
                {formatMoney(product.minAmount, product.currency)} – {formatMoney(product.maxAmount, product.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Repayment tenure options</dt>
              <dd className="mt-1 font-medium">{tenures.map((t) => formatTenure(t)).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Who can apply</dt>
              <dd className="mt-1 font-medium">{config.applicantTypes.map((t) => APPLICANT_TYPE_LABELS[t]).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Applicant age</dt>
              <dd className="mt-1 font-medium">
                {config.rules.minApplicantAge}–{config.rules.maxApplicantAge} years
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Personal references</dt>
              <dd className="mt-1 font-medium">{config.referencesRequired}</dd>
            </div>
          </dl>
          <LinkButton href={applyHref} className="h-10 w-full">
            Apply now
          </LinkButton>
          <DisclaimerNote>
            The amount you request is not an approved amount. Interest rates, fees and final terms are set by the lending partner. Displaying this product
            does not guarantee eligibility or approval.
          </DisclaimerNote>
        </aside>
      </Container>
    </>
  );
}
