import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listCommissionRules } from "@/server/services/commissions";
import { EmptyState, LinkButton, PageHeader, ToneBadge } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Commission rules" };

export default async function RulesPage() {
  const actor = await requirePagePermission("admin", "commission_rules.manage", "commissions.read_all");
  const rules = await listCommissionRules(actor);
  return (
    <>
      <PageHeader
        title="Commission rules"
        description="Rule selection: active and effective on the disbursement date; agent-specific beats product-specific beats generic, then higher priority, then latest start date. No real bank rates are configured — seeded rules are illustrative."
        actions={actor.permissions.has("commission_rules.manage") ? <LinkButton href="/admin/commissions/rules/new"><PlusIcon /> New rule</LinkButton> : null}
      />
      {rules.length === 0 ? (
        <EmptyState title="No commission rules" description="Without a matching rule, disbursed referrals are recorded as not eligible." />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map(({ rule, productName, agentLabel, usageCount }) => (
                <TableRow key={rule.id}>
                  <TableCell className="whitespace-normal">
                    <Link href={`/admin/commissions/rules/${rule.id}`} className="font-medium hover:underline">{rule.name}</Link>
                    {rule.isIllustrative ? <div className="text-xs text-muted-foreground">Illustrative demo rule</div> : null}
                  </TableCell>
                  <TableCell className="text-sm">{productName ?? "All products"} · {agentLabel ?? "All agents"}</TableCell>
                  <TableCell className="text-sm">
                    {rule.calcType === "PERCENTAGE" ? `${rule.ratePercent}%` : rule.calcType === "FIXED" ? formatMoney(rule.fixedAmount) : `${rule.slabs?.length ?? 0} slabs`}
                    {rule.capAmount ? <span className="text-muted-foreground"> · cap {formatMoney(rule.capAmount)}</span> : null}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(rule.effectiveFrom)} – {rule.effectiveTo ? formatDate(rule.effectiveTo) : "open"}</TableCell>
                  <TableCell><ToneBadge tone={rule.isActive ? "success" : "neutral"}>{rule.isActive ? "Active" : "Inactive"}</ToneBadge></TableCell>
                  <TableCell className="text-right tabular-nums">{usageCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
