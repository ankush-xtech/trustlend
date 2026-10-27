import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listRoles } from "@/server/services/roles";
import { LinkButton, PageHeader, ToneBadge } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const actor = await requirePagePermission("admin", "roles.manage", "permissions.manage", "roles.assign");
  const roles = await listRoles(actor);
  return (
    <>
      <PageHeader
        title="Roles"
        description="Roles bundle permissions. Changes take effect on users' next request — no deployment needed."
        actions={actor.permissions.has("roles.manage") ? <LinkButton href="/admin/roles/new"><PlusIcon /> New role</LinkButton> : null}
      />
      <div className="rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Permissions</TableHead>
              <TableHead className="text-right">Users</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-normal">
                  <Link href={`/admin/roles/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                  <div className="text-xs text-muted-foreground"><code>{r.key}</code> · {r.description}</div>
                </TableCell>
                <TableCell>{r.isSystem ? "System" : "Custom"}</TableCell>
                <TableCell><ToneBadge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Active" : "Inactive"}</ToneBadge></TableCell>
                <TableCell className="text-right tabular-nums">{r.permissionCount}</TableCell>
                <TableCell className="text-right tabular-nums">{r.userCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
