import { describe, expect, it } from "vitest";
import { calculateCommission, findSlab, selectRule, sumMoney, validateSlabs, type RuleInput } from "@/lib/domain/commission-calc";

const base: RuleInput = {
  id: "r-generic",
  name: "Generic",
  productId: null,
  agentId: null,
  calcType: "PERCENTAGE",
  ratePercent: "1.0000",
  fixedAmount: null,
  slabs: null,
  minBaseAmount: null,
  maxBaseAmount: null,
  capAmount: null,
  effectiveFrom: "2025-01-01",
  effectiveTo: null,
  priority: 0,
  isActive: true,
};

const slabRule: RuleInput = {
  ...base,
  id: "r-slab",
  calcType: "SLAB",
  ratePercent: null,
  slabs: [
    { minAmount: "0", maxAmount: "2500000", ratePercent: "0.35" },
    { minAmount: "2500000", maxAmount: "10000000", ratePercent: "0.50" },
    { minAmount: "10000000", maxAmount: null, ratePercent: "0.60" },
  ],
};

describe("calculateCommission", () => {
  it("computes percentage commissions with decimal precision", () => {
    expect(calculateCommission({ ...base, ratePercent: "0.35" }, "1234567.89").amount).toBe("4320.99");
    // 0.1 + 0.2 style float traps must not appear
    expect(calculateCommission({ ...base, ratePercent: "0.1" }, "300.30").amount).toBe("0.30");
  });

  it("rounds half-up to 2 decimals", () => {
    // 1% of 100.50 = 1.005 -> 1.01 (half-up), not banker's rounding
    expect(calculateCommission(base, "100.50").amount).toBe("1.01");
    expect(calculateCommission(base, "100.49").amount).toBe("1.00");
  });

  it("supports fixed commissions", () => {
    const r = calculateCommission({ ...base, calcType: "FIXED", ratePercent: null, fixedAmount: "2500" }, "999999");
    expect(r.amount).toBe("2500.00");
    expect(r.details.method).toBe("FIXED");
  });

  it("applies the cap after rounding", () => {
    const r = calculateCommission({ ...base, capAmount: "75000" }, "10000000");
    expect(r.amount).toBe("75000.00");
    expect(r.details.capApplied).toBe(true);
    expect(r.details.uncappedAmount).toBe("100000.00");
  });

  it("uses the slab containing the base: min inclusive, max exclusive", () => {
    expect(calculateCommission(slabRule, "2499999.99").amount).toBe("8750.00"); // 0.35%
    expect(calculateCommission(slabRule, "2500000").amount).toBe("12500.00"); // boundary -> 0.50%
    expect(calculateCommission(slabRule, "9999999.99").amount).toBe("50000.00"); // 0.50%
    expect(calculateCommission(slabRule, "10000000").amount).toBe("60000.00"); // boundary -> 0.60%
    expect(calculateCommission(slabRule, "4200000").amount).toBe("21000.00");
  });

  it("supports fixed-amount slabs", () => {
    const r = { ...slabRule, slabs: [{ minAmount: "0", maxAmount: "100000", fixedAmount: "500" }, { minAmount: "100000", maxAmount: null, fixedAmount: "1500" }] };
    expect(calculateCommission(r, "99999.99").amount).toBe("500.00");
    expect(calculateCommission(r, "100000").amount).toBe("1500.00");
  });

  it("rejects non-positive bases and uncovered slabs", () => {
    expect(() => calculateCommission(base, "0")).toThrow();
    expect(() => calculateCommission(base, "-5")).toThrow();
    const gap = { ...slabRule, slabs: [{ minAmount: "1000", maxAmount: null, ratePercent: "1" }] };
    expect(() => calculateCommission(gap, "500")).toThrow(/No slab/);
  });
});

describe("selectRule", () => {
  const ctx = { productId: "p-home", agentId: "a-1", baseAmount: "5000000", onDate: "2026-06-01" };

  it("prefers agent-specific over product-specific over generic", () => {
    const rules: RuleInput[] = [
      { ...base, id: "generic", priority: 100 },
      { ...base, id: "product", productId: "p-home" },
      { ...base, id: "agent", agentId: "a-1" },
      { ...base, id: "agent+product", agentId: "a-1", productId: "p-home" },
    ];
    expect(selectRule(rules, ctx)?.id).toBe("agent+product");
    expect(selectRule(rules.slice(0, 3), ctx)?.id).toBe("agent");
    expect(selectRule(rules.slice(0, 2), ctx)?.id).toBe("product");
  });

  it("uses priority then latest effective date as tie-breakers", () => {
    const rules: RuleInput[] = [
      { ...base, id: "old", effectiveFrom: "2025-01-01" },
      { ...base, id: "new", effectiveFrom: "2026-01-01" },
      { ...base, id: "low-priority-newest", effectiveFrom: "2026-05-01", priority: -1 },
    ];
    expect(selectRule(rules, ctx)?.id).toBe("new");
  });

  it("respects effective dates, active flag, other products/agents and base bounds", () => {
    expect(selectRule([{ ...base, effectiveFrom: "2026-07-01" }], ctx)).toBeNull();
    expect(selectRule([{ ...base, effectiveTo: "2026-05-31" }], ctx)).toBeNull();
    expect(selectRule([{ ...base, effectiveTo: "2026-06-01" }], ctx)).not.toBeNull(); // inclusive end date
    expect(selectRule([{ ...base, isActive: false }], ctx)).toBeNull();
    expect(selectRule([{ ...base, productId: "p-business" }], ctx)).toBeNull();
    expect(selectRule([{ ...base, agentId: "a-2" }], ctx)).toBeNull();
    expect(selectRule([{ ...base, minBaseAmount: "5000000.01" }], ctx)).toBeNull();
    expect(selectRule([{ ...base, maxBaseAmount: "5000000" }], ctx)).toBeNull(); // exclusive upper bound
  });
});

describe("validateSlabs", () => {
  it("accepts contiguous slabs with an open-ended last slab", () => {
    expect(validateSlabs(slabRule.slabs!)).toBeNull();
  });
  it("rejects gaps, overlaps, unbounded middle slabs and ambiguous slabs", () => {
    expect(validateSlabs([])).toMatch(/at least one/);
    expect(validateSlabs([{ minAmount: "0", maxAmount: "100", ratePercent: "1" }, { minAmount: "200", maxAmount: null, ratePercent: "1" }])).toMatch(/no gaps/);
    expect(validateSlabs([{ minAmount: "0", maxAmount: "100", ratePercent: "1" }, { minAmount: "50", maxAmount: null, ratePercent: "1" }])).toMatch(/no gaps/);
    expect(validateSlabs([{ minAmount: "0", maxAmount: null, ratePercent: "1" }, { minAmount: "100", maxAmount: null, ratePercent: "1" }])).toMatch(/last slab/);
    expect(validateSlabs([{ minAmount: "0", maxAmount: null, ratePercent: "1", fixedAmount: "5" }])).toMatch(/either a rate or a fixed/);
    expect(validateSlabs([{ minAmount: "0", maxAmount: null, ratePercent: "101" }])).toMatch(/between 0 and 100/);
  });
  it("findSlab returns null outside all slabs", () => {
    expect(findSlab([{ minAmount: "10", maxAmount: "20", ratePercent: "1" }], "20")).toBeNull();
  });
});

describe("money helpers", () => {
  it("sums decimal strings exactly", () => {
    expect(sumMoney(["0.10", "0.20", null, "1000000000.01"])).toBe("1000000000.31");
  });
});
