import Decimal from "decimal.js";

/**
 * Commission calculation (pure, decimal-safe).
 *
 * Commission base: the confirmed, eligible DISBURSED principal recorded for the application.
 * Requested and approved amounts are never used.
 *
 * Rule selection (most specific wins):
 *   1. rule must be active and effective on the disbursement date (effectiveFrom <= date <= effectiveTo)
 *   2. rule product must match (or be null = all products); rule agent must match (or be null = all agents)
 *   3. base must satisfy minBaseAmount <= base < maxBaseAmount (when set)
 *   4. ordering: agent-specific > product-specific > generic, then higher priority, then latest effectiveFrom
 *
 * Slabs: minAmount inclusive, maxAmount exclusive (null = unbounded). The slab containing the base
 * determines the rate (or fixed amount) applied to the whole base. Results are rounded half-up to 2 dp,
 * then capped at capAmount when set.
 */

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface SlabInput {
  minAmount: string;
  maxAmount: string | null;
  ratePercent?: string | null;
  fixedAmount?: string | null;
}

export interface RuleInput {
  id: string;
  name: string;
  productId: string | null;
  agentId: string | null;
  calcType: "PERCENTAGE" | "FIXED" | "SLAB";
  ratePercent: string | null;
  fixedAmount: string | null;
  slabs: SlabInput[] | null;
  minBaseAmount: string | null;
  maxBaseAmount: string | null;
  capAmount: string | null;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
  priority: number;
  isActive: boolean;
}

export interface SelectionContext {
  productId: string;
  agentId: string;
  baseAmount: string;
  /** Disbursement date YYYY-MM-DD. */
  onDate: string;
}

export function ruleMatches(rule: RuleInput, ctx: SelectionContext): boolean {
  if (!rule.isActive) return false;
  if (rule.effectiveFrom > ctx.onDate) return false;
  if (rule.effectiveTo && rule.effectiveTo < ctx.onDate) return false;
  if (rule.productId && rule.productId !== ctx.productId) return false;
  if (rule.agentId && rule.agentId !== ctx.agentId) return false;
  const base = new D(ctx.baseAmount);
  if (rule.minBaseAmount && base.lt(rule.minBaseAmount)) return false;
  if (rule.maxBaseAmount && base.gte(rule.maxBaseAmount)) return false;
  return true;
}

function specificity(rule: RuleInput) {
  return (rule.agentId ? 2 : 0) + (rule.productId ? 1 : 0);
}

export function selectRule(rules: RuleInput[], ctx: SelectionContext): RuleInput | null {
  const candidates = rules.filter((r) => ruleMatches(r, ctx));
  candidates.sort(
    (a, b) =>
      specificity(b) - specificity(a) ||
      b.priority - a.priority ||
      (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0) ||
      a.id.localeCompare(b.id),
  );
  return candidates[0] ?? null;
}

export function findSlab(slabs: SlabInput[], base: string): SlabInput | null {
  const b = new D(base);
  return slabs.find((s) => b.gte(s.minAmount) && (s.maxAmount === null || b.lt(s.maxAmount))) ?? null;
}

export interface CalculationResult {
  amount: string; // 2dp string
  details: {
    method: RuleInput["calcType"];
    base: string;
    ratePercent?: string;
    fixedAmount?: string;
    slab?: SlabInput;
    uncappedAmount: string;
    capApplied: boolean;
    capAmount?: string;
    rounding: "HALF_UP_2DP";
  };
}

export class CommissionCalculationError extends Error {}

export function calculateCommission(rule: RuleInput, baseAmount: string): CalculationResult {
  const base = new D(baseAmount);
  if (!base.isFinite() || base.lte(0)) throw new CommissionCalculationError("Commission base must be a positive amount");
  let raw: Decimal;
  const details: CalculationResult["details"] = {
    method: rule.calcType,
    base: base.toFixed(2),
    uncappedAmount: "0.00",
    capApplied: false,
    rounding: "HALF_UP_2DP",
  };

  if (rule.calcType === "PERCENTAGE") {
    if (rule.ratePercent == null) throw new CommissionCalculationError("Percentage rule has no rate");
    raw = base.mul(rule.ratePercent).div(100);
    details.ratePercent = new D(rule.ratePercent).toString();
  } else if (rule.calcType === "FIXED") {
    if (rule.fixedAmount == null) throw new CommissionCalculationError("Fixed rule has no amount");
    raw = new D(rule.fixedAmount);
    details.fixedAmount = new D(rule.fixedAmount).toFixed(2);
  } else {
    const slab = findSlab(rule.slabs ?? [], base.toString());
    if (!slab) throw new CommissionCalculationError("No slab covers the commission base");
    details.slab = slab;
    if (slab.ratePercent != null) {
      raw = base.mul(slab.ratePercent).div(100);
      details.ratePercent = new D(slab.ratePercent).toString();
    } else if (slab.fixedAmount != null) {
      raw = new D(slab.fixedAmount);
      details.fixedAmount = new D(slab.fixedAmount).toFixed(2);
    } else {
      throw new CommissionCalculationError("Slab defines neither a rate nor a fixed amount");
    }
  }

  let amount = raw.toDecimalPlaces(2, D.ROUND_HALF_UP);
  details.uncappedAmount = amount.toFixed(2);
  if (rule.capAmount != null && amount.gt(rule.capAmount)) {
    amount = new D(rule.capAmount).toDecimalPlaces(2, D.ROUND_HALF_UP);
    details.capApplied = true;
    details.capAmount = amount.toFixed(2);
  }
  return { amount: amount.toFixed(2), details };
}

/**
 * Validates slab definitions: sorted, contiguous (each max equals next min), non-overlapping,
 * only the last slab may be unbounded, and each slab has exactly one of rate / fixed amount.
 */
export function validateSlabs(slabs: SlabInput[]): string | null {
  if (slabs.length === 0) return "Add at least one slab";
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i];
    const hasRate = s.ratePercent != null && s.ratePercent !== "";
    const hasFixed = s.fixedAmount != null && s.fixedAmount !== "";
    if (hasRate === hasFixed) return `Slab ${i + 1}: set either a rate or a fixed amount`;
    if (hasRate && (new D(s.ratePercent!).lt(0) || new D(s.ratePercent!).gt(100))) return `Slab ${i + 1}: rate must be between 0 and 100`;
    if (hasFixed && new D(s.fixedAmount!).lt(0)) return `Slab ${i + 1}: fixed amount cannot be negative`;
    if (new D(s.minAmount).lt(0)) return `Slab ${i + 1}: minimum cannot be negative`;
    if (s.maxAmount !== null && new D(s.maxAmount).lte(s.minAmount)) return `Slab ${i + 1}: maximum must exceed minimum`;
    if (s.maxAmount === null && i !== slabs.length - 1) return `Only the last slab can be unbounded`;
    if (i > 0) {
      const prev = slabs[i - 1];
      if (prev.maxAmount === null || !new D(prev.maxAmount).eq(s.minAmount)) {
        return `Slab ${i + 1} must start exactly where slab ${i} ends (no gaps or overlaps)`;
      }
    }
  }
  return null;
}

/** Sum of decimal strings, returned as a 2dp string. */
export function sumMoney(values: (string | null | undefined)[]): string {
  return values.reduce((acc, v) => acc.add(v ?? 0), new D(0)).toFixed(2);
}

export function addMoney(a: string, b: string): string {
  return new D(a).add(b).toFixed(2);
}

export function compareMoney(a: string, b: string): number {
  return new D(a).cmp(b);
}
