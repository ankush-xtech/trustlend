import Link from "next/link";
import { MailIcon } from "lucide-react";
import { Container, PageIntro } from "@/components/public/marketing";
import { ContactForm } from "@/components/public/contact-form";
import { getSetting } from "@/server/services/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const supportEmail = await getSetting("support.contactEmail");
  return (
    <>
      <PageIntro eyebrow="Contact" title="Get in touch" description="Questions about applying, an existing application or becoming an agent? Send us a message." />
      <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="form-heading" className="rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
          <h2 id="form-heading" className="text-xl font-semibold">
            Send a message
          </h2>
          <div className="mt-6">
            <ContactForm />
          </div>
        </section>
        <aside className="space-y-6">
          <div className="rounded-2xl border bg-secondary/40 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <MailIcon className="size-5 text-primary" aria-hidden /> Email
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              <a href={`mailto:${supportEmail}`} className="font-medium text-primary hover:underline">
                {supportEmail}
              </a>
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6 text-sm leading-6 text-muted-foreground">
            <h2 className="font-semibold text-foreground">Already applied?</h2>
            <p className="mt-2">
              The fastest way to follow your application or answer a request is from your{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                dashboard
              </Link>
              .
            </p>
          </div>
        </aside>
      </Container>
    </>
  );
}
