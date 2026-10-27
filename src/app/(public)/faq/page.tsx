import Link from "next/link";
import { Container, PageIntro } from "@/components/public/marketing";
import { FAQ_GROUPS } from "@/components/public/faq-data";

export const metadata = { title: "Frequently asked questions" };

export default function FaqPage() {
  return (
    <>
      <PageIntro eyebrow="FAQ" title="Frequently asked questions" description="Answers about applying, documents, statuses, references, agents and security." />
      <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[220px_1fr]">
        <nav aria-label="FAQ sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            {FAQ_GROUPS.map((g) => (
              <li key={g.title}>
                <a href={`#${slug(g.title)}`} className="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  {g.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-10">
          {FAQ_GROUPS.map((g) => (
            <section key={g.title} id={slug(g.title)} aria-labelledby={`${slug(g.title)}-h`} className="scroll-mt-24">
              <h2 id={`${slug(g.title)}-h`} className="text-xl font-semibold">
                {g.title}
              </h2>
              <div className="mt-4 divide-y rounded-2xl border bg-card shadow-xs">
                {g.items.map((f) => (
                  <details key={f.q} className="group px-5 py-4">
                    <summary className="cursor-pointer list-none font-medium focus-visible:outline-2 focus-visible:outline-ring">
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
            </section>
          ))}
          <p className="text-sm text-muted-foreground">
            Still have a question?{" "}
            <Link href="/contact" className="font-medium text-primary hover:underline">
              Contact us
            </Link>
            .
          </p>
        </div>
      </Container>
    </>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
