import { requirePagePermission } from "@/server/auth/current";
import { listPermissionsWithRoles } from "@/server/services/roles";
import { PageHeader, ToneBadge } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Permissions" };

export default async function PermissionsPage() {
  const actor = await requirePagePermission("admin", "roles.manage", "permissions.manage", "roles.assign");
  const perms = await listPermissionsWithRoles(actor);
  return (
    <>
      <PageHeader
        title="Permission catalog"
        description="Capabilities the platform enforces on the server. Grant them to roles from each role's page. The catalog itself is defined in code so every permission has a matching server-side check."
      />
      <div className="rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Held by roles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perms.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="text-xs font-semibold">{p.key}</code>
                    {p.isSensitive ? <ToneBadge tone="warning">sensitive</ToneBadge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                </TableCell>
                <TableCell className="text-sm">{p.category}</TableCell>
                <TableCell className="max-w-sm whitespace-normal text-sm">{p.roleNames.join(", ") || <span className="text-muted-foreground">None</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
