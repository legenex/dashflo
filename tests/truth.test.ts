import { describe, expect, it } from "vitest";
import { computeTruth } from "@/domain/truth/compute";
import type { TruthDataset, TruthLead } from "@/domain/truth/types";

const TODAY = "2026-06-30";

function lead(overrides: Partial<TruthLead>): TruthLead {
  return {
    id: Math.random().toString(36).slice(2),
    campaignId: "c1",
    buyerId: "b1",
    supplierId: "s1",
    status: "sold",
    state: "TX",
    salePriceCents: 10000,
    supplierCostCents: 3500,
    paidAllocatedCents: 0,
    supplierPaidCents: 0,
    isTest: false,
    receivedAt: "2026-06-10",
    soldAt: "2026-06-10",
    returnedAt: null,
    paymentDueDate: "2026-07-10",
    ...overrides,
  };
}

function dataset(overrides: Partial<TruthDataset> = {}): TruthDataset {
  return {
    leads: [],
    spend: [],
    costs: [],
    attempts: [],
    periods: [],
    payments: [],
    connectors: { stripe: "active", mercury: "active", meta_ads: "active" },
    campaigns: [{ id: "c1", name: "MVA Direct" }],
    buyers: [{ id: "b1", name: "AG1 Walker" }],
    suppliers: [{ id: "s1", name: "LeadFlow" }],
    today: TODAY,
    ...overrides,
  };
}

describe("truth layers", () => {
  it("computes the four layers against a handcrafted fixture", () => {
    const ds = dataset({
      leads: [
        lead({ id: "l1", paidAllocatedCents: 10000, supplierPaidCents: 3500 }),
        lead({ id: "l2", paidAllocatedCents: 0 }),
        lead({ id: "l3", status: "unsold", salePriceCents: null }),
        lead({ id: "l4", status: "rejected", salePriceCents: null, supplierCostCents: 3500 }),
        lead({ id: "l5", status: "duplicate", salePriceCents: null }),
      ],
      spend: [
        { date: "2026-06-10", platform: "meta", mappedCampaignId: "c1", brand: "AAT", spendCents: 5000, paidStatus: "paid_verified", impressions: 1000, clicks: 50 },
        { date: "2026-06-11", platform: "meta", mappedCampaignId: "c1", brand: "AAT", spendCents: 3000, paidStatus: "tracked", impressions: 500, clicks: 20 },
      ],
    });
    const result = computeTruth(ds, { scope: "campaign" });
    expect(result.rows.length).toBe(1);
    const row = result.rows[0];

    // performance: 5 leads, 2 sold
    expect(row.performance.leads).toBe(5);
    expect(row.performance.sold).toBe(2);
    expect(row.performance.sold_rate).toBeCloseTo(0.4);
    expect(row.performance.dq_rate).toBeCloseTo(0.2); // 1 rejected
    expect(row.performance.duplicate_rate).toBeCloseTo(0.2);

    // booked: revenue 200, supplier cost accrued for sold+unsold+rejected? (not dup/error) = l1,l2,l3,l4 = 4*35
    expect(row.booked.booked_revenue).toBe(20000);
    expect(row.booked.supplier_cost_accrued).toBe(14000);
    expect(row.booked.media_cost_tracked).toBe(8000);
    expect(row.booked.reported_profit).toBe(20000 - 14000 - 8000);

    // verified: only l1 paid
    expect(row.verified.verified_income).toBe(10000);
    expect(row.verified.supplier_cost_paid).toBe(3500);
    expect(row.verified.media_spend_paid).toBe(5000);
    expect(row.verified.cash_profit).toBe(10000 - 5000 - 3500);

    // gap
    expect(row.gap.revenue_gap).toBe(10000);
    expect(row.gap.spend_gap).toBe(3000);
    expect(row.gap.outstanding).toBe(10000);
    expect(row.gap.overdue).toBe(0); // due 2026-07-10, today 06-30
  });

  it("returns reduce booked revenue and count in return_rate", () => {
    const ds = dataset({
      leads: [
        lead({ id: "l1", paidAllocatedCents: 10000 }),
        lead({ id: "l2", status: "returned", returnedAt: "2026-06-20" }),
      ],
    });
    const row = computeTruth(ds, { scope: "campaign" }).rows[0];
    expect(row.booked.booked_revenue).toBe(10000); // returned lead excluded
    expect(row.performance.return_rate).toBeCloseTo(0.5);
  });

  it("missing payment sources force UNKNOWN, never zero", () => {
    const ds = dataset({
      connectors: { stripe: "inactive", mercury: "inactive", meta_ads: "active" },
      leads: [lead({ id: "l1", paidAllocatedCents: 10000 })],
    });
    const row = computeTruth(ds, { scope: "campaign" }).rows[0];
    expect(row.verified.verified_income).toBeNull();
    expect(row.verified.cash_profit).toBeNull();
    expect(row.gap.revenue_gap).toBeNull();
    expect(row.gap.outstanding).toBeNull();
    expect(row.gap.verification_status).toBe("needs_source");
    expect(row.profit_truth).toBe("unknown");
    expect(row.gap.payment_status).toBe("no_payment_source");
    expect(row.gap.missing_sources).toContain("payments");
    expect(row.gap.data_quality).toBeLessThan(100);
  });

  it("inactive spend platform gates media cost to UNKNOWN", () => {
    const ds = dataset({
      connectors: { stripe: "active", mercury: "active", google_ads: "inactive" },
      leads: [lead({ id: "l1", paidAllocatedCents: 10000 })],
      spend: [
        { date: "2026-06-10", platform: "google", mappedCampaignId: "c1", brand: null, spendCents: 7000, paidStatus: "tracked", impressions: 0, clicks: 0 },
      ],
    });
    const row = computeTruth(ds, { scope: "campaign" }).rows[0];
    expect(row.booked.media_cost_tracked).toBeNull();
    expect(row.booked.reported_profit).toBeNull();
    expect(row.gap.missing_sources).toContain("google_ads");
    expect(row.profit_truth).toBe("unknown");
  });

  it("scope grouping: buyer and day", () => {
    const ds = dataset({
      leads: [
        lead({ id: "l1", buyerId: "b1", receivedAt: "2026-06-10" }),
        lead({ id: "l2", buyerId: "b2", receivedAt: "2026-06-11" }),
      ],
      buyers: [
        { id: "b1", name: "AG1" },
        { id: "b2", name: "AG2" },
      ],
    });
    const byBuyer = computeTruth(ds, { scope: "buyer" });
    expect(byBuyer.rows.length).toBe(2);
    const byDay = computeTruth(ds, { scope: "day" });
    expect(byDay.rows.map((r) => r.key).sort()).toEqual(["2026-06-10", "2026-06-11"]);
  });

  it("range and entity filters apply", () => {
    const ds = dataset({
      leads: [
        lead({ id: "l1", receivedAt: "2026-06-01" }),
        lead({ id: "l2", receivedAt: "2026-06-20", campaignId: "c2" }),
      ],
      campaigns: [
        { id: "c1", name: "A" },
        { id: "c2", name: "B" },
      ],
    });
    const filtered = computeTruth(ds, {
      scope: "campaign",
      range: { from: "2026-06-15", to: "2026-06-30" },
    });
    expect(filtered.rows.length).toBe(1);
    expect(filtered.rows[0].key).toBe("c2");
    const byId = computeTruth(ds, { scope: "campaign", filters: { campaignIds: ["c1"] } });
    expect(byId.rows.length).toBe(1);
    expect(byId.rows[0].key).toBe("c1");
  });

  it("test leads are excluded everywhere", () => {
    const ds = dataset({ leads: [lead({ id: "l1", isTest: true })] });
    const result = computeTruth(ds, { scope: "campaign" });
    expect(result.rows.length).toBe(0);
    expect(result.totals.performance.leads).toBe(0);
  });

  it("overdue and due soon buckets", () => {
    const ds = dataset({
      leads: [
        lead({ id: "past", paymentDueDate: "2026-06-15" }), // overdue
        lead({ id: "soon", paymentDueDate: "2026-07-03" }), // within 7 days
        lead({ id: "later", paymentDueDate: "2026-08-15" }),
      ],
    });
    const row = computeTruth(ds, { scope: "campaign" }).rows[0];
    expect(row.gap.overdue).toBe(10000);
    expect(row.gap.due_soon).toBe(10000);
    expect(row.gap.outstanding).toBe(30000);
  });

  it("short paid rolls up from flagged periods at buyer scope", () => {
    const ds = dataset({
      leads: [lead({ id: "l1", paidAllocatedCents: 8000 })],
      periods: [
        {
          counterpartyType: "buyer",
          counterpartyId: "b1",
          granularity: "month",
          periodStart: "2026-06-01",
          periodEnd: "2026-06-30",
          expectedCents: 10000,
          paidCents: 8000,
          varianceCents: 2000,
          status: "variance_flagged",
        },
      ],
    });
    const row = computeTruth(ds, { scope: "buyer" }).rows[0];
    expect(row.gap.short_paid).toBe(2000);
    expect(row.gap.payment_status).toBe("short_paid");
  });

  it("unmatched payment flows land on totals only", () => {
    const ds = dataset({
      leads: [lead({ id: "l1" })],
      payments: [
        { direction: "in", amountCents: 4200, matchStatus: "unmatched", date: "2026-06-20" },
        { direction: "out", amountCents: 990, matchStatus: "unmatched", date: "2026-06-21" },
        { direction: "in", amountCents: 5000, matchStatus: "auto_matched", date: "2026-06-22" },
      ],
    });
    const result = computeTruth(ds, { scope: "campaign" });
    expect(result.totals.gap.unmatched_in).toBe(4200);
    expect(result.totals.gap.unmatched_out).toBe(990);
  });
});
