import { requirePortal } from "@/server/auth/current";
import { getMyAgentProfile } from "@/server/services/agents";
import { ProfilePage } from "@/components/shared/profile-page";
import { DescriptionList, Section } from "@/components/shared/display";

export const metadata = { title: "Profile" };

export default async function Page() {
  const actor = await requirePortal("agent");
  const agent = await getMyAgentProfile(actor);
  return (
    <ProfilePage
      actor={actor}
      extra={
        agent ? (
          <Section title="Agent profile" description="Contact TrustLend to update company or payout details.">
            <DescriptionList
              items={[
                { label: "Agent code", value: agent.agentCode },
                { label: "Status", value: agent.status === "ACTIVE" ? "Active" : "Suspended" },
                { label: "Company", value: agent.companyName ?? "—" },
                { label: "City", value: agent.city ?? "—" },
                { label: "Payout reference", value: agent.payoutReferenceMasked ?? "Not provided" },
              ]}
            />
          </Section>
        ) : null
      }
    />
  );
}
