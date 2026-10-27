import { LinkButton } from "@/components/shared/display";
import { CheckList, Container, PageIntro } from "@/components/public/marketing";

export const metadata = { title: "About TrustLend" };

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About"
        title="Making loan applications clear and accountable"
        description="TrustLend is a loan application facilitation platform. We help customers and agents prepare complete applications and work with lending partners through a controlled, transparent process."
      />
      <Container className="grid gap-12 py-12 sm:py-16 lg:grid-cols-2">
        <section aria-labelledby="what-heading">
          <h2 id="what-heading" className="text-2xl font-bold tracking-tight">
            What we do
          </h2>
          <div className="mt-4 space-y-4 leading-7 text-muted-foreground">
            <p>
              Applying for a loan often means repeated paperwork and little visibility. TrustLend guides applicants through only the information their
              product needs, checks documents carefully and keeps every stage visible.
            </p>
            <p>
              We do not lend money ourselves and we do not make credit decisions. Lending partners assess applications and set rates and terms. We record
              their decisions as they confirm them.
            </p>
          </div>
        </section>
        <section aria-labelledby="principles-heading" className="rounded-2xl border bg-card p-6 shadow-xs">
          <h2 id="principles-heading" className="text-xl font-semibold">
            Our principles
          </h2>
          <div className="mt-4">
            <CheckList
              items={[
                "Collect only what is needed for the chosen loan product.",
                "Never present an estimate or a requested amount as a lender decision.",
                "Give staff access only to the applications they are assigned to.",
                "Record important actions in an audit trail.",
                "Be honest about what is and is not guaranteed.",
              ]}
            />
          </div>
        </section>
        <section aria-labelledby="agents-heading" className="lg:col-span-2">
          <h2 id="agents-heading" className="text-2xl font-bold tracking-tight">
            Agents
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
            Authorised agents can refer customers and help them apply. Agent accounts are created by invitation after review by our team. If you are
            interested in becoming an agent, please contact us.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href="/contact">Contact us</LinkButton>
            <LinkButton href="/how-it-works" variant="outline">
              How it works
            </LinkButton>
          </div>
        </section>
      </Container>
    </>
  );
}
