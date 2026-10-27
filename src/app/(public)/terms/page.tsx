import { Container, PageIntro } from "@/components/public/marketing";

export const metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  return (
    <>
      <PageIntro eyebrow="Legal" title="Terms and conditions" description="The terms that apply when you use TrustLend." />
      <Container className="py-12 sm:py-16">
        <div className="mb-8 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-[oklch(0.4_0.09_65)]">
          <strong>Template — requires legal review before launch.</strong> These terms outline the intended service model and must be reviewed and
          completed by qualified legal counsel before being relied upon.
        </div>
        <article className="prose-legal max-w-3xl">
          <h2>1. The service</h2>
          <p>
            TrustLend is a loan application facilitation platform. We help you prepare an application, review your documents and submit your application to
            a lending partner. We are not a lender and do not make credit decisions.
          </p>

          <h2>2. No guarantee of approval</h2>
          <p>
            Displaying a loan product does not guarantee eligibility or approval. The amount you request is not an approved amount. Interest rates, fees,
            approved amounts and other terms are decided solely by the lending partner. Any eligibility information on the platform is informational only.
          </p>

          <h2>3. Your account</h2>
          <ul>
            <li>You must provide accurate information and keep your sign-in details confidential.</li>
            <li>Public registration creates a customer account only. Agent and staff accounts are created by invitation.</li>
            <li>We may suspend accounts that are misused or that pose a security risk.</li>
          </ul>

          <h2>4. Your information and documents</h2>
          <ul>
            <li>You confirm that the information and documents you provide are genuine, belong to you (or you are authorised to provide them) and are accurate.</li>
            <li>You confirm that the people you list as references have agreed to be contacted. References are not guarantors or co-applicants.</li>
            <li>Uploading a document does not mean it is verified; documents are reviewed by authorised staff.</li>
          </ul>

          <h2>5. Agents</h2>
          <p>
            Agents are independent referrers authorised by TrustLend. An agent may help you apply but cannot approve loans or change lender decisions. Agent
            commissions, where applicable, are paid by TrustLend and do not change the terms offered to you by a lending partner.
          </p>

          <h2>6. Acceptable use</h2>
          <p>Do not attempt to access other users&apos; information, interfere with the platform, upload malicious files or submit false information.</p>

          <h2>7. Liability</h2>
          <p>[Limitation of liability, indemnity and dispute-resolution terms to be drafted by legal counsel.]</p>

          <h2>8. Changes and contact</h2>
          <p>We may update these terms and will indicate the latest revision date. Questions can be sent through the contact page.</p>
        </article>
      </Container>
    </>
  );
}
