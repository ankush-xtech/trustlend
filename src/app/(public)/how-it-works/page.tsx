import { LinkButton } from "@/components/shared/display";
import { Container, DisclaimerNote, PageIntro, StepsList } from "@/components/public/marketing";

export const metadata = { title: "How it works" };

const AFTER = [
  { title: "Document review", body: "A loan officer is assigned and reviews each document. If anything is missing or unclear, you receive a specific request." },
  { title: "Internal review", body: "Once documentation is complete, our review team checks the file before it is prepared for a lending partner." },
  { title: "Lender assessment", body: "The application is submitted to a lending partner, who performs its own assessment and makes the credit decision." },
  { title: "Decision and disbursement", body: "We record the lender's decision when they confirm it. Disbursement is recorded only after the lender confirms it." },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        eyebrow="How it works"
        title="From first step to lender decision"
        description="A guided application, careful document review and clear status updates — so you always know what happens next."
      >
        <LinkButton href="/register" size="lg" className="h-11 px-5">
          Start your application
        </LinkButton>
      </PageIntro>
      <Container className="space-y-16 py-12 sm:py-16">
        <section aria-labelledby="apply-heading">
          <h2 id="apply-heading" className="text-2xl font-bold tracking-tight">
            1. Complete the five-step application
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Save a draft at any point and continue later. You review a summary before you submit.</p>
          <div className="mt-8">
            <StepsList />
          </div>
        </section>
        <section aria-labelledby="after-heading">
          <h2 id="after-heading" className="text-2xl font-bold tracking-tight">
            2. What happens after you submit
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2">
            {AFTER.map((s, i) => (
              <li key={s.title} className="rounded-xl border bg-card p-5 shadow-xs">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">Stage {i + 1}</p>
                <h3 className="mt-1 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
        <DisclaimerNote>
          Completing documentation does not mean your loan is approved, and an approval does not mean funds have been disbursed. Each stage is recorded
          separately and shown on your application timeline.
        </DisclaimerNote>
      </Container>
    </>
  );
}
