import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getRoleDetail, listPermissionsCatalog } from "@/server/services/roles";
import { setRolePermissionsAction, updateRoleAction } from "@/server/actions/admin";
import { PageHeader, Section, ToneBadge } from "@/components/shared/display";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { CheckboxField, TextAreaField, TextField } from "@/components/shared/form-controls";
import { PermissionCheckboxes } from "@/components/admin/permission-checkboxes";
import { isUuid, orNotFound } from "@/components/admin/server-utils";
import { SYSTEM_ROLE_KEYS } from "@/server/rbac/catalog";

export const metadata = { title: "Role" };

export default async function RoleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission("admin", "roles.manage", "permissions.manage", "roles.assign");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { created } = await searchParams;
  const [role, catalog] = await Promise.all([orNotFound(getRoleDetail(actor, id)), listPermissionsCatalog(actor)]);
  const isSuperAdminRole = role.key === SYSTEM_ROLE_KEYS.SUPER_ADMIN;
  const canEditPerms = actor.permissions.has("permissions.manage") && !isSuperAdminRole;

  return (
    <>
      <PageHeader
        title={role.name}
        breadcrumb={{ href: "/admin/roles", label: "Roles" }}
        description={role.description || undefined}
        actions={
          <>
            <ToneBadge tone={role.isSystem ? "info" : "neutral"}>{role.isSystem ? "System role" : "Custom role"}</ToneBadge>
            <ToneBadge tone={role.isActive ? "success" : "neutral"}>{role.isActive ? "Active" : "Inactive"}</ToneBadge>
          </>
        }
      />
      {created ? <p role="status" className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">Role created.</p> : null}
      <div className="grid gap-6">
        {actor.permissions.has("roles.manage") ? (
          <Section title="Details" description={role.isSystem ? "System roles cannot be renamed or deactivated." : undefined}>
            <ActionForm action={updateRoleAction} className="grid max-w-2xl gap-4">
              <input type="hidden" name="roleId" value={role.id} />
              <TextField label="Key" name="key_display" value={role.key} disabled />
              {role.isSystem ? <input type="hidden" name="name" value={role.name} /> : null}
              <TextField label="Name" name={role.isSystem ? "name_display" : "name"} defaultValue={role.name} disabled={role.isSystem} required />
              <TextAreaField label="Description" name="description" defaultValue={role.description} rows={2} />
              {role.isSystem ? (
                <input type="hidden" name="isActive" value="on" />
              ) : (
                <CheckboxField label="Active" name="isActive" defaultChecked={role.isActive} description="Inactive roles grant no permissions and cannot be assigned." />
              )}
              <div>
                <SubmitButton>Save details</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        ) : null}

        <Section
          title="Permissions"
          description={
            isSuperAdminRole
              ? "The Super Admin role always holds every administrative permission and cannot be edited."
              : canEditPerms
                ? "Select the permissions this role grants. Sensitive permissions should be granted sparingly."
                : "You can view but not change this role's permissions."
          }
        >
          <ActionForm action={setRolePermissionsAction} className="grid gap-4">
            <input type="hidden" name="roleId" value={role.id} />
            <PermissionCheckboxes permissions={catalog} checked={new Set(role.permissionKeys)} actorPermissions={actor.permissions} readOnly={!canEditPerms} />
            {canEditPerms ? (
              <div>
                <SubmitButton pendingText="Saving…">Save permissions</SubmitButton>
              </div>
            ) : null}
          </ActionForm>
        </Section>

        <Section title={`Members (${role.members.length})`} description="Assign or remove roles from a user's page.">
          {role.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users hold this role.</p>
          ) : (
            <ul className="divide-y">
              {role.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {actor.permissions.has("users.read") ? <Link href={`/admin/users/${m.id}`} className="font-medium hover:underline">{m.name}</Link> : <span className="font-medium">{m.name}</span>}
                    <span className="text-muted-foreground"> · {m.email}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{m.status.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
