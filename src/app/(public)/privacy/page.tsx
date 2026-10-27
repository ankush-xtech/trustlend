import { Container, PageIntro } from "@/components/public/marketing";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <>
      <PageIntro eyebrow="Legal" title="Privacy policy" description="How TrustLend collects, uses and protects personal information." />
      <Container className="py-12 sm:py-16">
        <div className="mb-8 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-[oklch(0.4_0.09_65)]">
          <strong>Template — requires legal review before launch.</strong> This policy describes how the platform is designed to handle data. It must be
          reviewed and completed by qualified legal counsel for the operating entity and applicable law (including India&apos;s Digital Personal Data
          Protection Act, 2023 and any lender or regulatory requirements) before being relied upon.
        </div>
        <article className="prose-legal max-w-3xl">
          <h2>1. Who we are</h2>
          <p>
            TrustLend (&quot;we&quot;, &quot;us&quot;) operates a loan application facilitation platform. We help applicants prepare and submit loan
            applications to lending partners. Lending partners make credit decisions. [Operating entity name, registered address and contact details to be
            inserted.]
          </p>

          <h2>2. Information we collect</h2>
          <ul>
            <li>Account information: name, email address, mobile number and a securely hashed password.</li>
            <li>Personal details: full legal name, date of birth, contact details, the type of identity document and only the last four characters of its number.</li>
            <li>Address information: current and, where required, permanent address.</li>
            <li>Employment or business information: employer, role and income, or business name, type, registration details, years in operation and turnover.</li>
            <li>Loan requirement: requested amount, purpose, preferred tenure and product-specific details.</li>
            <li>Documents you upload, such as identity proof, address proof, income proof, bank statements and business or property documents.</li>
            <li>
              Personal references: the name, relationship, mobile number and city of people you list as references. You are responsible for informing your
              references and obtaining their consent before sharing their details with us.
            </li>
            <li>Technical and security information: sign-in times, IP address and device information used for security, rate limiting and audit logs.</li>
          </ul>

          <h2>3. How we use information</h2>
          <ul>
            <li>To create and secure your account and verify your email address.</li>
            <li>To process, review and track your loan application, including document verification by authorised staff.</li>
            <li>To submit your application to a lending partner at your request and record their decision.</li>
            <li>To send service notifications about your account and applications.</li>
            <li>To attribute referrals to authorised agents and calculate agent commissions where applicable.</li>
            <li>To prevent fraud, protect the platform and meet legal obligations.</li>
          </ul>

          <h2>4. Sharing</h2>
          <p>
            We share your application and documents with a lending partner only for the purpose of processing the loan you have applied for, with your
            consent given when you submit your application. If an authorised agent referred you, they can see limited information about the applications
            they referred. We use service providers (for example hosting, private file storage and email delivery) under appropriate agreements. We do not
            sell personal information.
          </p>

          <h2>5. Retention</h2>
          <p>
            We keep application, decision, audit and financial records for as long as required for legal, regulatory and dispute-resolution purposes.
            Documents removed from a draft application are deleted from storage. [Specific retention periods to be defined.]
          </p>

          <h2>6. Security</h2>
          <p>
            Documents are kept in private storage and accessed only through short-lived, access-checked links. Access to applications is restricted by role
            and assignment, sensitive actions are recorded in an audit trail, and passwords are stored only as secure hashes. No system is completely
            secure; we review and improve our safeguards over time.
          </p>

          <h2>7. Your rights</h2>
          <p>
            Subject to applicable law, you may request access to, correction of, or erasure of your personal information, withdraw consent, and raise a
            grievance. Some information must be retained where the law requires it. To make a request, use the contact page and choose &quot;Privacy
            request&quot;. [Grievance officer details to be inserted.]
          </p>

          <h2>8. Changes</h2>
          <p>We will update this policy when our practices change and indicate the date of the latest revision.</p>

          <h2>9. Contact</h2>
          <p>For privacy questions, contact us through the contact page. [Postal address and grievance contact to be inserted.]</p>
        </article>
      </Container>
    </>
  );
}
