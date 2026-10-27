import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getUserDetail } from "@/server/services/users";
import { listRoles } from "@/server/services/roles";
import {
  assignRoleAction,
  removeRoleAction,
  resendInvitationAction,
  setUserStatusAction,
  updateUserAction,
} from "@/server/actions/admin";
import { DescriptionList, PageHeader, Section, ToneBadge } from "@/components/shared/display";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { NativeSelect, TextField } from "@/components/shared/form-controls";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { formatDateTime } from "@/lib/format";
import { isUuid, orNotFound } from "@/components/admin/server-utils";

export const metadata = { title: "User" };

const STATUS_TONE = { ACTIVE: "success", DISABLED: "danger", INVITED: "warning" } as const;

export default async function UserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission("admin", "users.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { invited } = await searchParams;
  const user = await orNotFound(getUserDetail(actor, id));
  const canAssign = actor.permissions.has("roles.assign");
  const allRoles = canAssign ? await listRoles(actor) : [];
  const assignable = allRoles.filter((r) => r.isActive && !user.roles.some((ur) => ur.id === r.id));
  const isSelf = actor.userId === user.id;

  return (
    <>
      <PageHeader
        title={user.name}
        breadcrumb={{ href: "/admin/users", label: "Users" }}
        description={user.email}
        actions={
          <>
            <ToneBadge tone={STATUS_TONE[user.status]}>{user.status.toLowerCase()}</ToneBadge>
            {user.status === "INVITED" && actor.permissions.has("users.create") ? (
              <ConfirmAction action={resendInvitationAction} trigger="Resend invitation" title="Resend invitation?" description="A new single-use link is emailed; any previous link stops working." fields={{ userId: user.id }} confirmLabel="Resend" />
            ) : null}
            {actor.permissions.has("users.deactivate") && !isSelf && user.status !== "INVITED" ? (
              user.status === "ACTIVE" ? (
                <ConfirmAction
                  action={setUserStatusAction}
                  trigger="Deactivate"
                  triggerVariant="destructive"
                  destructive
                  title="Deactivate this account?"
                  description="The user is signed out of all sessions immediately and can no longer sign in. Their records are retained."
                  fields={{ userId: user.id, status: "DISABLED" }}
                  reason={{ label: "Reason (recorded in the audit log)", required: true }}
                  confirmLabel="Deactivate"
                />
              ) : (
                <ConfirmAction
                  action={setUserStatusAction}
                  trigger="Reactivate"
                  title="Reactivate this account?"
                  fields={{ userId: user.id, status: "ACTIVE" }}
                  reason={{ label: "Reason (recorded in the audit log)", required: true }}
                  confirmLabel="Reactivate"
                />
              )
            ) : null}
          </>
        }
      />
      {invited ? <p role="status" className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">Invitation sent. The user can set a password using the emailed link.</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Account">
          <DescriptionList
            items={[
              { label: "Email verified", value: user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt) : "Not verified" },
              { label: "Last sign-in", value: formatDateTime(user.lastLoginAt) },
              { label: "Created", value: formatDateTime(user.createdAt) },
              { label: "Phone", value: user.phone ?? "—" },
            ]}
          />
        </Section>
        {actor.permissions.has("users.update") ? (
          <Section title="Edit details">
            <ActionForm action={updateUserAction} className="grid gap-4">
              <input type="hidden" name="userId" value={user.id} />
              <TextField label="Full name" name="name" defaultValue={user.name} required />
              <TextField label="Mobile number" name="phone" defaultValue={user.phone ?? ""} inputMode="tel" />
              <div>
                <SubmitButton>Save</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        ) : null}
        <Section title="Roles" description="Permissions come from roles and apply on the user's next request." className="lg:col-span-2">
          {user.roles.length === 0 ? <p className="text-sm text-muted-foreground">No roles assigned. The user cannot open any workspace.</p> : null}
          <ul className="divide-y">
            {user.roles.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium">{r.name}</span>
                  {!r.isActive ? <span className="ml-2 text-xs text-muted-foreground">(role inactive)</span> : null}
                  <div className="text-xs text-muted-foreground">Assigned {formatDateTime(r.assignedAt)}</div>
                </div>
                {canAssign ? (
                  <ConfirmAction
                    action={removeRoleAction}
                    trigger="Remove"
                    triggerVariant="ghost"
                    destructive
                    title={`Remove the ${r.name} role?`}
                    description="The user loses this role's permissions immediately."
                    fields={{ userId: user.id, roleId: r.id }}
                    confirmLabel="Remove role"
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {canAssign && assignable.length ? (
            <ActionForm action={assignRoleAction} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <label className="grid gap-1 text-sm font-medium">
                Add role
                <NativeSelect name="roleId" required className="min-w-56">
                  {assignable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <SubmitButton variant="outline">Assign role</SubmitButton>
            </ActionForm>
          ) : null}
        </Section>
      </div>
    </>
  );
}
