import Link from "next/link";
import { UserPlusIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listAgents } from "@/server/services/agents";
import { EmptyState, FilterBar, FilterInput, FilterSelect, LinkButton, PageHeader, PaginationNav, ToneBadge, sp, spPage } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import type { SearchParams } from "@/components/admin/server-utils";

export const metadata = { title: "Agents" };

export default async function AgentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePagePermission("admin", "agents.read_all");
  const params = await searchParams;
  const result = await listAgents(actor, { q: sp(params, "q"), status: sp(params, "status"), page: spPage(params) });
  return (
    <>
      <PageHeader
        title="Agents"
        description="Agents are onboarded by administrators and refer customers to TrustLend."
        actions={actor.permissions.has("agents.manage") ? <LinkButton href="/admin/agents/new"><UserPlusIcon /> Onboard agent</LinkButton> : null}
      />
      <FilterBar basePath="/admin/agents">
        <FilterInput label="Search" name="q" defaultValue={sp(params, "q")} placeholder="Name, email or code" />
        <FilterSelect label="Status" name="status" defaultValue={sp(params, "status")} options={[{ value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }]} />
      </FilterBar>
      {result.rows.length === 0 ? (
        <EmptyState title="No agents found" />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active referrals</TableHead>
                <TableHead className="text-right">Submitted apps</TableHead>
                <TableHead className="text-right">Disbursed</TableHead>
                <TableHead className="text-right">Commission paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/admin/agents/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                    <div className="text-xs text-muted-foreground">{a.email}{a.companyName ? ` · ${a.companyName}` : ""}</div>
                  </TableCell>
                  <TableCell><code className="text-xs">{a.agentCode}</code></TableCell>
                  <TableCell>
                    <ToneBadge tone={a.status === "ACTIVE" ? "success" : "danger"}>{a.status.toLowerCase()}</ToneBadge>
                    {a.userStatus === "INVITED" ? <div className="mt-1 text-xs text-muted-foreground">Invitation pending</div> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.referralCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.applicationCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.disbursedCount}</TableCell>
                  <TableCell className="text-right">{formatMoney(a.commissionPaid)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationNav page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/agents" searchParams={params} />
    </>
  );
}
