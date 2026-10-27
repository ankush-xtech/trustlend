import { requirePagePermission } from "@/server/auth/current";
import { listPermissionsCatalog } from "@/server/services/roles";
import { createRoleAction } from "@/server/actions/admin";
import { PageHeader, Section } from "@/components/shared/display";
import { ActionForm, FieldErrorText, SubmitButton } from "@/components/shared/action-form";
import { TextAreaField, TextField } from "@/components/shared/form-controls";
import { PermissionCheckboxes } from "@/components/admin/permission-checkboxes";

export const metadata = { title: "New role" };

export default async function NewRolePage() {
  const actor = await requirePagePermission("admin", "roles.manage");
  const perms = await listPermissionsCatalog(actor);
  const canGrant = actor.permissions.has("permissions.manage");
  return (
    <>
      <PageHeader
        title="Create a role"
        breadcrumb={{ href: "/admin/roles", label: "Roles" }}
        description="A new role receives only the permissions you explicitly select. You can only grant permissions you hold yourself."
      />
      <ActionForm action={createRoleAction} className="grid gap-6" refreshOnSuccess={false}>
        <Section title="Details">
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <TextField label="Key" name="key" required placeholder="senior_reviewer" hint="Lowercase letters, numbers and underscores. Cannot be changed later." />
            <TextField label="Name" name="name" required placeholder="Senior Reviewer" />
            <TextAreaField label="Description" name="description" className="sm:col-span-2" rows={2} />
          </div>
        </Section>
        <Section title="Permissions" description={canGrant ? undefined : "You need the permissions.manage permission to grant permissions; the role will be created empty."}>
          <PermissionCheckboxes permissions={perms} checked={new Set()} actorPermissions={actor.permissions} readOnly={!canGrant} />
          <FieldErrorText name="permissionKeys" />
        </Section>
        <div>
          <SubmitButton pendingText="Creating…">Create role</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
