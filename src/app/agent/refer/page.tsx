import { requirePagePermission } from "@/server/auth/current";
import { PageHeader, Section } from "@/components/shared/display";
import { ReferForm } from "@/components/agent/refer-form";

export const metadata = { title: "Refer a customer" };

export default async function Page() {
  const actor = await requirePagePermission("agent", "referrals.create");
  return (
    <>
      <PageHeader
        title="Refer a customer"
        description="Register a customer you are referring. If the customer is already known to TrustLend, the referral is sent to our team for review — attribution is never changed automatically."
        breadcrumb={{ href: "/agent", label: "Dashboard" }}
      />
      <Section>
        {actor.agentActive ? <ReferForm /> : <p className="text-sm text-muted-foreground">Your agent profile is suspended, so new referrals are disabled.</p>}
      </Section>
    </>
  );
}
