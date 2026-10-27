export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_GROUPS: { title: string; items: FaqItem[] }[] = [
  {
    title: "Applying",
    items: [
      {
        q: "Does TrustLend lend money?",
        a: "No. TrustLend helps you prepare a complete application, verifies your documents and submits it to a lending partner (a bank or NBFC). The lending partner makes the credit decision and sets the rate and terms.",
      },
      {
        q: "Does seeing a loan product mean I am eligible?",
        a: "No. Displaying a product does not guarantee eligibility or approval. Eligibility notes on product pages are informational only; the lending partner applies its own criteria.",
      },
      {
        q: "Can I save my application and finish later?",
        a: "Yes. Every step is saved as a draft when you continue. You can sign in later and resume from where you left off until you submit.",
      },
      {
        q: "Can I have more than one application?",
        a: "Yes, within the limit set by the platform. You can track each application separately from your dashboard. You can withdraw an application you no longer need.",
      },
    ],
  },
  {
    title: "Documents",
    items: [
      {
        q: "Which documents do I need?",
        a: "It depends on the loan product and how you earn your income. Typical documents are identity proof, address proof, income proof and bank statements, plus business registration and financial statements for business applicants. The exact list is shown on each product page and in the application.",
      },
      {
        q: "Which file formats are accepted?",
        a: "PDF, PNG and JPEG files up to the size limit shown on the upload screen. Files are checked on our servers; renamed or unsupported files are rejected.",
      },
      {
        q: "What happens if a document is rejected?",
        a: "You will see the reason in your dashboard and receive a notification. You can upload a replacement for the rejected document.",
      },
      {
        q: "Does uploading a document mean it has been verified?",
        a: "No. Each document is reviewed by a member of our team, who records whether it is accepted. A document is not treated as verified just because it was uploaded.",
      },
    ],
  },
  {
    title: "Status and timelines",
    items: [
      {
        q: "What do the application statuses mean?",
        a: "Your dashboard shows the current stage in plain language, for example 'Reviewing documents', 'Action needed', 'With lender' or 'Disbursed', together with a timeline of updates.",
      },
      {
        q: "How long does it take?",
        a: "It varies. Document review usually moves faster when all documents are clear and complete. Once your application is with a lending partner, timing depends on their assessment process.",
      },
      {
        q: "What does 'Action needed' mean?",
        a: "Our team needs more information or documents from you. Open the application to see the request and respond directly from your dashboard.",
      },
    ],
  },
  {
    title: "References and agents",
    items: [
      {
        q: "What are references?",
        a: "References are two people who know you, such as a relative or friend, whom we may contact to confirm basic details. They are not guarantors or co-applicants and take on no liability. Please make sure they have agreed to share their contact details.",
      },
      {
        q: "What is an agent?",
        a: "Some customers are introduced by an authorised TrustLend agent who can help them apply. Agents only see the applications they referred and never your other information. Agent accounts are created by invitation only.",
      },
    ],
  },
  {
    title: "Privacy and security",
    items: [
      {
        q: "How is my data protected?",
        a: "Documents are kept in private storage and are only accessible to authorised people through short-lived links. Access is controlled by role, every sensitive action is recorded in an audit trail, and passwords are stored only as secure hashes.",
      },
      {
        q: "Who can see my application?",
        a: "You, the staff members assigned to review it, authorised administrators and — if you were referred — your referring agent with limited information. Your application is shared with a lending partner only to process your request.",
      },
    ],
  },
];
