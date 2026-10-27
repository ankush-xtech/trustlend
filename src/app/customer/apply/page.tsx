import { CheckIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listActiveProducts, getProductDocuments } from "@/server/services/products";
import { db } from "@/server/db/client";
import { env } from "@/server/config/env";
import { APPLICANT_TYPE_LABELS } from "@/lib/domain/product-config";
import { formatMoney, formatTenure } from "@/lib/format";
import { EmptyState, IllustrativeNotice, PageHeader } from "@/components/shared/display";
import { StartApplicationButton } from "@/components/applications/start-application";

export const metadata = { title: "New application" };

export default async function ApplyPage() {
  const actor = await requirePagePermission("customer", "applications.create");
  const products = await listActiveProducts();
  const docs = await Promise.all(products.map((p) => getProductDocuments(db, p.id)));
  const needsVerification = env().REQUIRE_EMAIL_VERIFICATION && !actor.emailVerified;

  return (
    <>
      <PageHeader
        title="Start a new application"
        description="Choose a loan product. The application has 5 short steps, and your progress is saved after each step."
        breadcrumb={{ href: "/customer", label: "Dashboard" }}
      />
      {needsVerification ? (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm" role="status">
          Please verify your email address before starting an application. Check your inbox for the verification link.
        </div>
      ) : null}
      {products.length === 0 ? (
        <EmptyState title="No products available" description="No loan products are accepting applications right now. Please check back later." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {products.map((p, i) => (
            <article key={p.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-xs">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.shortDescription}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Amount</dt>
                  <dd className="font-medium">
                    {formatMoney(p.minAmount, p.currency)} – {formatMoney(p.maxAmount, p.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tenure options</dt>
                  <dd className="font-medium">
                    {formatTenure(Math.min(...p.config.tenureOptionsMonths))} – {formatTenure(Math.max(...p.config.tenureOptionsMonths))}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">For</dt>
                  <dd>{p.config.applicantTypes.map((t) => APPLICANT_TYPE_LABELS[t]).join(", ")}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Documents you&apos;ll need</p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {docs[i]
                    .filter((d) => d.isRequired)
                    .map((d) => (
                      <li key={d.id} className="flex items-start gap-2">
                        <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {d.label}
                        {d.applicantTypes?.length ? <span className="text-xs text-muted-foreground">({d.applicantTypes.map((t) => APPLICANT_TYPE_LABELS[t]).join(", ")})</span> : null}
                      </li>
                    ))}
                </ul>
              </div>
              {p.isIllustrative ? (
                <div className="mt-4">
                  <IllustrativeNotice />
                </div>
              ) : null}
              <div className="mt-auto pt-5">
                <StartApplicationButton productId={p.id} label={`Apply for ${p.name}`} />
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Submitting an application does not guarantee approval. Loan amounts, interest rates and terms are decided by the lending partner.
      </p>
    </>
  );
}
