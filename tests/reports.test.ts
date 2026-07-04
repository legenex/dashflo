import { describe, expect, it } from "vitest";
import {
  computeAggregates,
  computeMetricValue,
  evaluateFormula,
  leadMatchesFieldFilter,
  validateFormula,
  type MetricAggregates,
} from "@/domain/reports/metrics";
import type { TruthDataset, TruthLead } from "@/domain/truth/types";

function lead(overrides: Partial<TruthLead>): TruthLead {
  return {
    id: Math.random().toString(36).slice(2),
    campaignId: "c1", buyerId: "b1", supplierId: "s1",
    status: "sold", state: "TX",
    salePriceCents: 10000, supplierCostCents: 3500,
    paidAllocatedCents: 0, supplierPaidCents: 0,
    isTest: false, receivedAt: "2026-06-10", soldAt: "2026-06-10",
    returnedAt: null, paymentDueDate: null,
    ...overrides,
  };
}

const dataset = {
  leads: [], spend: [], costs: [], attempts: [], periods: [], payments: [],
  connectors: { stripe: "active" }, campaigns: [], buyers: [], suppliers: [],
  today: "2026-07-04",
} as TruthDataset;

describe("aggregates", () => {
  it("splits statuses and computes revenue net of returns", () => {
    const leads = [
      lead({ paidAllocatedCents: 10000 }),
      lead({ status: "returned" }),
      lead({ status: "rejected", salePriceCents: null }),
      lead({ status: "duplicate", salePriceCents: null }),
      lead({ status: "unsold", salePriceCents: null }),
    ];
    const a = computeAggregates(leads, dataset, { today: "2026-07-04" });
    expect(a.leads).toBe(5);
    expect(a.sold).toBe(1);
    expect(a.returned).toBe(1);
    expect(a.fake).toBe(1);
    expect(a.duplicates).toBe(1);
    expect(a.grossRevenueCents).toBe(20000);
    expect(a.revenueCents).toBe(10000);
    expect(a.verifiedCents).toBe(10000);
    // supplier cost skips duplicates/errors: sold + returned + rejected + unsold = 4 x 3500
    expect(a.supplierCostCents).toBe(14000);
  });

  it("gates verified to null when payment feeds are off", () => {
    const gated = { ...dataset, connectors: { stripe: "inactive" } } as TruthDataset;
    const a = computeAggregates([lead({ paidAllocatedCents: 5000 })], gated, { today: "2026-07-04" });
    expect(a.verifiedCents).toBeNull();
    expect(computeMetricValue("net_profit", a)).toBeNull();
  });
});

describe("metric registry", () => {
  const a: MetricAggregates = {
    leads: 100, sold: 50, returned: 5, duplicates: 10, fake: 20, errors: 5, unsold: 10, unmatched: 0,
    grossRevenueCents: 550000, revenueCents: 500000, verifiedCents: 300000,
    supplierCostCents: 200000, supplierPaidCents: 150000, mediaCostCents: 100000, otherCostCents: 0,
  };

  it("computes the standard card metrics", () => {
    expect(computeMetricValue("revenue", a)).toBe(550000);
    expect(computeMetricValue("net_revenue", a)).toBe(500000);
    expect(computeMetricValue("cost", a)).toBe(300000);
    expect(computeMetricValue("cpl", a)).toBe(3000);
    expect(computeMetricValue("profit", a)).toBe(200000);
    expect(computeMetricValue("net_profit", a)).toBe(50000);
    expect(computeMetricValue("conv_rate", a)).toBeCloseTo(0.5);
    expect(computeMetricValue("gp_margin", a)).toBeCloseTo(0.4);
    expect(computeMetricValue("fake_leads", a)).toBe(20);
  });

  it("evaluates custom metric formulas over base metrics", () => {
    const custom = [{ id: "custom_rps", label: "Rev / Sold", formula: "net_revenue / sold_leads", format: "money" as const }];
    expect(computeMetricValue("custom_rps", a, custom)).toBe(10000);
    const margin = [{ id: "custom_m", label: "M", formula: "(net_revenue - cost) / net_revenue * 100", format: "number" as const }];
    expect(computeMetricValue("custom_m", a, margin)).toBeCloseTo(40);
  });
});

describe("formula parser", () => {
  it("handles precedence, parens, and unary minus", () => {
    const v = (f: string) => {
      const r = evaluateFormula(f, (id) => (id === "sold_leads" ? 10 : id === "total_leads" ? 40 : null));
      return r.ok ? r.value : r.error;
    };
    expect(v("2 + 3 * 4")).toBe(14);
    expect(v("(2 + 3) * 4")).toBe(20);
    expect(v("sold_leads / total_leads")).toBe(0.25);
    expect(v("-sold_leads + 12")).toBe(2);
  });

  it("null propagates and division by zero yields null, never zero", () => {
    const r = evaluateFormula("revenue / total_leads", (id) => (id === "total_leads" ? 0 : 100));
    expect(r.ok && r.value).toBeNull();
    const n = evaluateFormula("verified_income + 5", () => null);
    expect(n.ok && n.value).toBeNull();
  });

  it("rejects unknown metrics and bad syntax", () => {
    expect(validateFormula("bogus_metric + 1").ok).toBe(false);
    expect(validateFormula("revenue +").ok).toBe(false);
    expect(validateFormula("(revenue").ok).toBe(false);
    expect(validateFormula("revenue / sold_leads").ok).toBe(true);
  });
});

describe("field filters", () => {
  const l = lead({ state: "TX" });
  const fd = { incident_date: "2026-07-01", injury_type: "whiplash", usage_years: 8 };

  it("within_days matches recent dates relative to today", () => {
    expect(leadMatchesFieldFilter(l, fd, { id: "f", label: "", field: "incident_date", operator: "within_days", value: 7, enabled: true }, "2026-07-04")).toBe(true);
    expect(leadMatchesFieldFilter(l, fd, { id: "f", label: "", field: "incident_date", operator: "within_days", value: 2, enabled: true }, "2026-07-04")).toBe(false);
  });

  it("supports equals, in, gt, and state as a field", () => {
    expect(leadMatchesFieldFilter(l, fd, { id: "f", label: "", field: "injury_type", operator: "equals", value: "Whiplash", enabled: true }, "2026-07-04")).toBe(true);
    expect(leadMatchesFieldFilter(l, fd, { id: "f", label: "", field: "usage_years", operator: "gt", value: 5, enabled: true }, "2026-07-04")).toBe(true);
    expect(leadMatchesFieldFilter(l, fd, { id: "f", label: "", field: "state", operator: "in", value: "TX, FL", enabled: true }, "2026-07-04")).toBe(true);
    expect(leadMatchesFieldFilter(l, fd, { id: "f", label: "", field: "state", operator: "in", value: ["GA"], enabled: true }, "2026-07-04")).toBe(false);
  });
});
