import { requirePagePermission } from "@/server/auth/current";
import { onboardAgentAction } from "@/server/actions/admin";
import { PageHeader, Section } from "@/components/shared/display";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { TextField } from "@/components/shared/form-controls";

export const metadata = { title: "Onboard agent" };

export default async function NewAgentPage() {
  await requirePagePermission("admin", "agents.manage");
  return (
    <>
      <PageHeader
        title="Onboard an agent"
        breadcrumb={{ href: "/admin/agents", label: "Agents" }}
        description="Creates an agent profile and emails an invitation to set a password. Agents cannot self-register."
      />
      <Section>
        <ActionForm action={onboardAgentAction} className="grid max-w-2xl gap-4 sm:grid-cols-2" refreshOnSuccess={false}>
          <TextField label="Full name" name="name" required />
          <TextField label="Email" name="email" type="email" required />
          <TextField label="Mobile number" name="phone" required inputMode="tel" />
          <TextField label="Company / firm" name="companyName" />
          <TextField label="City" name="city" />
          <TextField
            label="Payout reference (masked)"
            name="payoutReferenceMasked"
            placeholder="XXXX1234"
            hint="Only a masked reference is stored. Full bank details are handled outside the platform."
          />
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Onboarding…">Onboard and invite</SubmitButton>
          </div>
        </ActionForm>
      </Section>
    </>
  );
}
