import { describe, expect, it } from "vitest";
import {
  allocateAcrossLeads,
  classifyPayment,
  invoiceStatusAfterPayment,
  tokenOverlap,
  type MatchableInvoice,
  type MatchablePayment,
} from "@/domain/matching/engine";
import { buildPeriods, varianceNarrative } from "@/domain/matching/periods";

function invoice(overrides: Partial<MatchableInvoice> = {}): MatchableInvoice {
  return {
    id: "inv_1",
    direction: "receivable",
    counterpartyType: "buyer",
    counterpartyId: "buy_1",
    counterpartyName: "AG1 Walker LLC",
    externalRef: "INV-2026-001",
    dueDate: "2026-06-10",
    issueDate: "2026-05-31",
    amountCents: 500000,
    amountPaidCents: 0,
    status: "sent",
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    ...overrides,
  };
}

function payment(overrides: Partial<MatchablePayment> = {}): MatchablePayment {
  return {
    id: "pay_1",
    externalRef: null,
    date: "2026-06-09",
    amountCents: 500000,
    direction: "in",
    counterpartyName: "AG1 WALKER LLC",
    memo: null,
    ...overrides,
  };
}

const emptyCtx = { invoices: [], rules: [], counterparties: [] };

describe("payment classification tiers", () => {
  it("tier 1: exact external ref = 100", () => {
    const s = classifyPayment(payment({ externalRef: "INV-2026-001" }), {
      ...emptyCtx,
      invoices: [invoice()],
    });
    expect(s?.confidence).toBe(100);
    expect(s?.tier).toBe("external_ref");
  });

  it("tier 2: amount within 1% and date within 7 days = 85", () => {
    const s = classifyPayment(payment({ amountCents: 498000 }), { ...emptyCtx, invoices: [invoice()] });
    expect(s?.confidence).toBe(85);
    expect(s?.tier).toBe("amount_date");
  });

  it("tier 2 fails outside the windows", () => {
    const farDate = classifyPayment(payment({ date: "2026-07-15" }), { ...emptyCtx, invoices: [invoice()] });
    expect(farDate?.confidence).not.toBe(85);
    const farAmount = classifyPayment(payment({ amountCents: 400000 }), { ...emptyCtx, invoices: [invoice()] });
    expect(farAmount?.confidence).not.toBe(85);
  });

  it("tier 3: match rule regex = 75, routes mercury outflows to ad platforms", () => {
    const s = classifyPayment(
      payment({ counterpartyName: "FACEBK ADS", direction: "out", amountCents: 123400, date: "2026-06-02" }),
      {
        ...emptyCtx,
        rules: [
          {
            id: "r1",
            name: "Meta spend",
            counterpartyPattern: "facebk|meta platforms",
            amountTolerancePct: 10,
            dateWindowDays: 30,
            target: "ad_platform",
            targetId: "meta",
          },
        ],
      }
    );
    expect(s?.confidence).toBe(75);
    expect(s?.target).toEqual({ type: "ad_platform", id: "meta" });
  });

  it("tier 4: fuzzy name with plausible amount = 55, suggestion only", () => {
    const s = classifyPayment(
      payment({ counterpartyName: "WALKER AG1 GROUP", amountCents: 350000, date: "2026-06-25" }),
      { ...emptyCtx, invoices: [invoice()] }
    );
    expect(s?.confidence).toBe(55);
    expect(s?.tier).toBe("fuzzy");
  });

  it("returns null when nothing is plausible", () => {
    const s = classifyPayment(payment({ counterpartyName: "TOTALLY UNRELATED VENDOR", amountCents: 12 }), emptyCtx);
    expect(s).toBeNull();
  });
});

describe("token overlap", () => {
  it("normalizes legal suffixes and punctuation", () => {
    expect(tokenOverlap("AG1 Walker, LLC", "ag1 walker")).toBe(1);
    expect(tokenOverlap("Quintessa Legal Group", "AG2 Quintessa")).toBeGreaterThan(0);
    expect(tokenOverlap("Stripe", "Mercury")).toBe(0);
  });
});

describe("allocation across leads", () => {
  const leads = [
    { id: "l1", salePriceCents: 9500, alreadyAllocatedCents: 0, soldAt: new Date("2026-06-01") },
    { id: "l2", salePriceCents: 9500, alreadyAllocatedCents: 0, soldAt: new Date("2026-06-02") },
    { id: "l3", salePriceCents: 9500, alreadyAllocatedCents: 0, soldAt: new Date("2026-06-03") },
  ];

  it("fills oldest first, partial on the boundary lead", () => {
    const allocs = allocateAcrossLeads(14000, leads);
    expect(allocs).toEqual([
      { leadId: "l1", allocatedCents: 9500, resulting: "matched" },
      { leadId: "l2", allocatedCents: 4500, resulting: "partial" },
    ]);
  });

  it("respects prior allocations", () => {
    const partial = [{ id: "l1", salePriceCents: 9500, alreadyAllocatedCents: 9000, soldAt: new Date("2026-06-01") }];
    expect(allocateAcrossLeads(2000, partial)).toEqual([
      { leadId: "l1", allocatedCents: 500, resulting: "matched" },
    ]);
  });

  it("stops when the payment is exhausted", () => {
    expect(allocateAcrossLeads(0, leads)).toEqual([]);
  });
});

describe("invoice status transitions", () => {
  it("partial then paid", () => {
    expect(invoiceStatusAfterPayment(10000, 0, 4000, "2026-07-01", "2026-06-15")).toEqual({
      amountPaidCents: 4000,
      status: "partial",
    });
    expect(invoiceStatusAfterPayment(10000, 4000, 6000, "2026-07-01", "2026-06-15")).toEqual({
      amountPaidCents: 10000,
      status: "paid",
    });
  });

  it("zero paid past due is overdue", () => {
    expect(invoiceStatusAfterPayment(10000, 0, 0, "2026-06-01", "2026-06-15").status).toBe("overdue");
  });
});

describe("reconciliation periods", () => {
  const variance = { pctThreshold: 2, centsThreshold: 25000 };

  it("aggregates expected from sold leads minus returns, excludes test", () => {
    const periods = buildPeriods({
      leads: [
        { id: "a", counterpartyId: "b1", amountCents: 9500, date: "2026-05-05", returned: false, isTest: false },
        { id: "b", counterpartyId: "b1", amountCents: 9500, date: "2026-05-06", returned: true, isTest: false },
        { id: "c", counterpartyId: "b1", amountCents: 9500, date: "2026-05-07", returned: false, isTest: true },
      ],
      invoices: [],
      payments: [],
      granularity: "month",
      variance,
      today: "2026-07-01",
    });
    expect(periods.length).toBe(1);
    expect(periods[0].expectedCents).toBe(9500);
    expect(periods[0].leadCount).toBe(1);
  });

  it("flags variance beyond max(2%, $250) only for completed periods", () => {
    const mk = (paid: number, today: string) =>
      buildPeriods({
        leads: Array.from({ length: 100 }, (_, i) => ({
          id: `l${i}`,
          counterpartyId: "b1",
          amountCents: 10000,
          date: "2026-05-10",
          returned: false,
          isTest: false,
        })),
        invoices: [],
        payments: paid > 0 ? [{ counterpartyId: "b1", amountCents: paid, date: "2026-05-20" }] : [],
        granularity: "month",
        variance,
        today,
      })[0];

    // expected $10,000; paid $9,700 = variance $300 > max($200, $250) -> flagged
    expect(mk(970000, "2026-07-01").status).toBe("variance_flagged");
    // within threshold: paid $9,990, variance $100 -> matched-ish/open
    expect(mk(999000, "2026-07-01").status).toBe("matched");
    // incomplete period never flags
    expect(mk(970000, "2026-05-15").status).toBe("open");
  });

  it("matched when paid covers expected", () => {
    const p = buildPeriods({
      leads: [{ id: "a", counterpartyId: "b1", amountCents: 9500, date: "2026-05-05", returned: false, isTest: false }],
      invoices: [],
      payments: [{ counterpartyId: "b1", amountCents: 9500, date: "2026-05-28" }],
      granularity: "month",
      variance,
      today: "2026-07-01",
    })[0];
    expect(p.status).toBe("matched");
    expect(p.varianceCents).toBe(0);
  });

  it("weekly granularity buckets by ISO week", () => {
    const periods = buildPeriods({
      leads: [
        { id: "a", counterpartyId: "b1", amountCents: 100, date: "2026-06-01", returned: false, isTest: false }, // Monday
        { id: "b", counterpartyId: "b1", amountCents: 100, date: "2026-06-07", returned: false, isTest: false }, // Sunday same week
        { id: "c", counterpartyId: "b1", amountCents: 100, date: "2026-06-08", returned: false, isTest: false }, // next week
      ],
      invoices: [],
      payments: [],
      granularity: "week",
      variance,
      today: "2026-07-01",
    });
    expect(periods.length).toBe(2);
    const first = periods.find((p) => p.periodStart === "2026-06-01");
    expect(first?.expectedCents).toBe(200);
    expect(first?.periodEnd).toBe("2026-06-07");
  });

  it("writes a plain language narrative with lead estimate", () => {
    const text = varianceNarrative({
      counterpartyName: "AG1 Walker",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      varianceCents: 145000,
      expectedCents: 950000,
      leadCount: 100,
    });
    expect(text).toContain("AG1 Walker");
    expect(text).toContain("$1,450.00");
    expect(text).toContain("15 leads");
  });
});
