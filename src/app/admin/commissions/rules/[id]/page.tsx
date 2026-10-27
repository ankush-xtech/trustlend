import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getCommissionRule } from "@/server/services/commissions";
import { listProductsAdmin } from "@/server/services/products";
import { listAgentOptions } from "@/server/services/agents";
import { IllustrativeNotice, PageHeader } from "@/components/shared/display";
import { CommissionRuleForm } from "@/components/admin/commission-rule-form";
import { isUuid, orNotFound } from "@/components/admin/server-utils";

export const metadata = { title: "Commission rule" };

export default async function RuleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("admin", "commission_rules.manage", "commissions.read_all");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { rule, usage } = await orNotFound(getCommissionRule(actor, id));
  const canManage = actor.permissions.has("commission_rules.manage");
  const [products, agents] = await Promise.all([
    actor.permissions.has("loan_products.read") || actor.permissions.has("loan_products.manage") ? listProductsAdmin(actor) : Promise.resolve([]),
    actor.permissions.has("agents.read_all") ? listAgentOptions(actor) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={rule.name} breadcrumb={{ href: "/admin/commissions/rules", label: "Commission rules" }} description={canManage ? undefined : "Read-only view."} />
      {rule.isIllustrative ? (
        <div className="mb-4">
          <IllustrativeNotice>Illustrative demo rule from the seed script. These are not real lender or partner rates.</IllustrativeNotice>
        </div>
      ) : null}
      <CommissionRuleForm
        ruleId={rule.id}
        usage={usage}
        readOnly={!canManage}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        agents={agents}
        initial={{
          name: rule.name,
          description: rule.description,
          productId: rule.productId ?? "",
          agentId: rule.agentId ?? "",
          calcType: rule.calcType,
          ratePercent: rule.ratePercent ?? "",
          fixedAmount: rule.fixedAmount ?? "",
          slabs: (rule.slabs ?? []).map((s) => ({ minAmount: s.minAmount, maxAmount: s.maxAmount ?? "", ratePercent: s.ratePercent ?? "", fixedAmount: s.fixedAmount ?? "" })),
          minBaseAmount: rule.minBaseAmount ?? "",
          maxBaseAmount: rule.maxBaseAmount ?? "",
          capAmount: rule.capAmount ?? "",
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo ?? "",
          priority: rule.priority,
          isActive: rule.isActive,
        }}
      />
    </>
  );
}
