import Link from "next/link";
import { UserPlusIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listUsers } from "@/server/services/users";
import { listRoles } from "@/server/services/roles";
import { EmptyState, FilterBar, FilterInput, FilterSelect, LinkButton, PageHeader, PaginationNav, ToneBadge, sp, spPage } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { SearchParams } from "@/components/admin/server-utils";

export const metadata = { title: "Users" };

const STATUS_TONE = { ACTIVE: "success", DISABLED: "danger", INVITED: "warning" } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePagePermission("admin", "users.read");
  const params = await searchParams;
  const [result, roles] = await Promise.all([
    listUsers(actor, { q: sp(params, "q"), status: sp(params, "status"), roleId: sp(params, "roleId"), page: spPage(params) }),
    listRoles(actor),
  ]);
  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in to TrustLend. Admin-created users receive an invitation to set their own password."
        actions={actor.permissions.has("users.create") && actor.permissions.has("roles.assign") ? <LinkButton href="/admin/users/new"><UserPlusIcon /> Invite user</LinkButton> : null}
      />
      <FilterBar basePath="/admin/users">
        <FilterInput label="Search" name="q" defaultValue={sp(params, "q")} placeholder="Name or email" />
        <FilterSelect label="Status" name="status" defaultValue={sp(params, "status")} options={[{ value: "ACTIVE", label: "Active" }, { value: "INVITED", label: "Invited" }, { value: "DISABLED", label: "Disabled" }]} />
        <FilterSelect label="Role" name="roleId" defaultValue={sp(params, "roleId")} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
      </FilterBar>
      {result.rows.length === 0 ? (
        <EmptyState title="No users match these filters" />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">{u.name}</Link>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-sm">{u.roleNames.join(", ") || "—"}</TableCell>
                  <TableCell>
                    <ToneBadge tone={STATUS_TONE[u.status]}>{u.status.toLowerCase()}</ToneBadge>
                    {!u.emailVerifiedAt && u.status === "ACTIVE" ? <div className="mt-1 text-xs text-muted-foreground">Email unverified</div> : null}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(u.lastLoginAt)}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(u.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/users" searchParams={params} />
    </>
  );
}
