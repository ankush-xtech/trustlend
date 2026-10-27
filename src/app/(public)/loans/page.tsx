import { Container, DisclaimerNote, PageIntro, ProductCard } from "@/components/public/marketing";
import { listActiveProducts } from "@/server/services/products";

export const dynamic = "force-dynamic";
export const metadata = { title: "Loan products" };

export default async function LoansPage() {
  const products = await listActiveProducts();
  return (
    <>
      <PageIntro
        eyebrow="Loan products"
        title="Loan products open for applications"
        description="Compare request limits, tenure options and required documents. Rates and final terms are set by the lending partner after assessment."
      />
      <Container className="py-12 sm:py-16">
        {products.length ? (
          <div className="grid gap-6 md:grid-cols-2">
            {products.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">
            No loan products are open for applications right now. Please check back soon.
          </p>
        )}
        <div className="mt-10">
          <DisclaimerNote>
            Displaying a loan product does not guarantee eligibility or approval. TrustLend facilitates loan applications; lending decisions, interest rates
            and terms are determined solely by lending partners.
          </DisclaimerNote>
        </div>
      </Container>
    </>
  );
}
