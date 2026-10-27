import { requirePagePermission } from "@/server/auth/current";
import { listProductsAdmin } from "@/server/services/products";
import { listAgentOptions } from "@/server/services/agents";
import { PageHeader } from "@/components/shared/display";
import { CommissionRuleForm } from "@/components/admin/commission-rule-form";
import { todayIso } from "@/lib/format";

export const metadata = { title: "New commission rule" };

export default async function NewRulePage() {
  const actor = await requirePagePermission("admin", "commission_rules.manage");
  const [products, agents] = await Promise.all([
    listProductsAdmin(actor),
    actor.permissions.has("agents.read_all") ? listAgentOptions(actor) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="New commission rule" breadcrumb={{ href: "/admin/commissions/rules", label: "Commission rules" }} />
      <CommissionRuleForm
        ruleId={null}
        usage={0}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        agents={agents}
        initial={{
          name: "",
          description: "",
          productId: "",
          agentId: "",
          calcType: "PERCENTAGE",
          ratePercent: "",
          fixedAmount: "",
          slabs: [{ minAmount: "0", maxAmount: "", ratePercent: "", fixedAmount: "" }],
          minBaseAmount: "",
          maxBaseAmount: "",
          capAmount: "",
          effectiveFrom: todayIso(),
          effectiveTo: "",
          priority: 0,
          isActive: true,
        }}
      />
    </>
  );
}
