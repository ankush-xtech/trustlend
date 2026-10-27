import { requirePagePermission } from "@/server/auth/current";
import { listRoles } from "@/server/services/roles";
import { inviteUserAction } from "@/server/actions/admin";
import { PageHeader, Section } from "@/components/shared/display";
import { ActionForm, FieldErrorText, SubmitButton } from "@/components/shared/action-form";
import { TextField } from "@/components/shared/form-controls";

export const metadata = { title: "Invite user" };

export default async function NewUserPage() {
  const actor = await requirePagePermission("admin", "users.create");
  const roles = (await listRoles(actor)).filter((r) => r.isActive);
  return (
    <>
      <PageHeader
        title="Invite a user"
        breadcrumb={{ href: "/admin/users", label: "Users" }}
        description="The user receives a single-use invitation link (valid 72 hours) to set their own password. You can only assign roles whose permissions you hold yourself."
      />
      <Section>
        <ActionForm action={inviteUserAction} className="grid max-w-2xl gap-4" refreshOnSuccess={false}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" name="name" required autoComplete="off" />
            <TextField label="Email" name="email" type="email" required autoComplete="off" />
            <TextField label="Mobile number" name="phone" inputMode="tel" hint="Optional" />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Roles <span className="text-destructive">*</span></legend>
            <p className="text-xs text-muted-foreground">To onboard an agent with an agent profile, use Agents → Onboard agent instead.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.map((r) => (
                <label key={r.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50">
                  <input type="checkbox" name="roleIds" value={r.id} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span>
                    <span className="font-medium">{r.name}</span>
                    {r.isSystem ? <span className="ml-1 text-xs text-muted-foreground">(system)</span> : null}
                    <span className="block text-xs text-muted-foreground">{r.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldErrorText name="roleIds" />
          </fieldset>
          <div>
            <SubmitButton pendingText="Sending invitation…">Send invitation</SubmitButton>
          </div>
        </ActionForm>
      </Section>
    </>
  );
}
