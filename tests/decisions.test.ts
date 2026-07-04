import { describe, expect, it } from "vitest";
import {
  classifyDecision,
  classifyPaymentStatus,
  classifyProfitTruth,
  riskScore,
  type DecisionInput,
  type ProfitTruthInput,
} from "@/domain/decisions/classify";

function pt(overrides: Partial<ProfitTruthInput> = {}): ProfitTruthInput {
  return {
    bookedRevenue: 100000,
    verifiedIncome: 95000,
    reportedProfit: 40000,
    cashProfit: 35000,
    spendTracked: 30000,
    spendPaidVerified: 30000,
    anyBookedPastTerms: false,
    missingRequiredSource: false,
    ...overrides,
  };
}

describe("profit truth classifier", () => {
  it("cash verified at >=90% verified with paid spend", () => {
    expect(classifyProfitTruth(pt())).toBe("cash_verified");
    expect(classifyProfitTruth(pt({ verifiedIncome: 90000 }))).toBe("cash_verified");
    expect(classifyProfitTruth(pt({ verifiedIncome: 89999 }))).toBe("estimated");
  });

  it("cash verified requires spend to be paid verified", () => {
    expect(classifyProfitTruth(pt({ spendPaidVerified: 10000 }))).toBe("estimated");
  });

  it("at risk when booked exists with zero verified", () => {
    expect(classifyProfitTruth(pt({ verifiedIncome: 0, reportedProfit: 0, cashProfit: 0 }))).toBe("at_risk");
  });

  it("unknown when a required source is missing", () => {
    expect(classifyProfitTruth(pt({ missingRequiredSource: true }))).toBe("unknown");
    expect(classifyProfitTruth(pt({ verifiedIncome: null }))).toBe("unknown");
  });

  it("false profit: positive reported with negative cash", () => {
    expect(
      classifyProfitTruth(pt({ verifiedIncome: 30000, cashProfit: -5000, reportedProfit: 40000 }))
    ).toBe("false_profit");
  });

  it("false profit: <50% verified past the terms window with positive reported profit", () => {
    expect(
      classifyProfitTruth(pt({ verifiedIncome: 40000, cashProfit: 5000, anyBookedPastTerms: true }))
    ).toBe("false_profit");
    // Same verification level but nothing past terms: not false profit yet.
    expect(
      classifyProfitTruth(pt({ verifiedIncome: 40000, cashProfit: 5000, anyBookedPastTerms: false }))
    ).toBe("estimated");
  });

  it("booked when nothing is verified yet but nothing is overdue", () => {
    expect(
      classifyProfitTruth(
        pt({ bookedRevenue: 0, verifiedIncome: 0, reportedProfit: 0, cashProfit: 0 })
      )
    ).toBe("booked");
  });
});

function di(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    soldRate: 0.5,
    cashMargin: 0.4,
    bookedMargin: 0.45,
    verifiedIncome: 90000,
    bookedRevenue: 100000,
    trueCplCents: 4000,
    returnDqRate: 0.05,
    spendMappedAndPaid: true,
    supplierCostConfident: true,
    missingMoneySource: false,
    revenueOverduePastTerms: false,
    shortPaid: false,
    ...overrides,
  };
}

describe("decision classifier", () => {
  it("scale when everything is verified and strong", () => {
    expect(classifyDecision(di())).toBe("scale");
  });

  it("boundary: sold rate and margin at thresholds", () => {
    expect(classifyDecision(di({ soldRate: 0.25, cashMargin: 0.3 }))).toBe("scale");
    expect(classifyDecision(di({ soldRate: 0.24 }))).toBe("watch");
    expect(classifyDecision(di({ cashMargin: 0.29 }))).toBe("watch");
    expect(classifyDecision(di({ returnDqRate: 0.15 }))).toBe("watch");
  });

  it("cut on negative verified cash margin", () => {
    expect(classifyDecision(di({ cashMargin: -0.1 }))).toBe("cut");
  });

  it("cut on true CPL above target", () => {
    expect(classifyDecision(di({ trueCplCents: 20000 }))).toBe("cut");
  });

  it("cut when revenue is unpaid past terms with no verification", () => {
    expect(
      classifyDecision(di({ verifiedIncome: 0, cashMargin: null, revenueOverduePastTerms: true }))
    ).toBe("cut");
  });

  it("needs source when a money source is missing", () => {
    expect(classifyDecision(di({ missingMoneySource: true }))).toBe("needs_source");
  });

  it("review when booked is strong but verified is weak", () => {
    expect(
      classifyDecision(di({ verifiedIncome: 20000, cashMargin: 0.1, bookedMargin: 0.5 }))
    ).toBe("review");
  });
});

describe("payment status classifier", () => {
  const base = {
    bookedRevenue: 100000,
    verifiedIncome: 50000,
    outstanding: 50000,
    overdue: 0,
    dueSoon: 0,
    shortPaid: 0,
    hasPaymentSource: true,
    hasUnmatchedSuggestions: false,
  };

  it("orders severity: short paid > overdue > verified > due soon > partial", () => {
    expect(classifyPaymentStatus({ ...base, shortPaid: 100 })).toBe("short_paid");
    expect(classifyPaymentStatus({ ...base, overdue: 100 })).toBe("overdue");
    expect(classifyPaymentStatus({ ...base, verifiedIncome: 100000, outstanding: 0 })).toBe("verified_paid");
    expect(classifyPaymentStatus({ ...base, dueSoon: 100 })).toBe("due_soon");
    expect(classifyPaymentStatus(base)).toBe("partially_paid");
  });

  it("no payment source dominates", () => {
    expect(classifyPaymentStatus({ ...base, hasPaymentSource: false })).toBe("no_payment_source");
  });

  it("not applicable without booked revenue", () => {
    expect(classifyPaymentStatus({ ...base, bookedRevenue: 0 })).toBe("not_applicable");
  });
});

describe("risk score", () => {
  it("zero for clean buyers, 70 for missing source, scales with balances", () => {
    expect(riskScore({ bookedRevenue: 100000, overdue: 0, shortPaid: 0, hasPaymentSource: true })).toBe(0);
    expect(riskScore({ bookedRevenue: 100000, overdue: 0, shortPaid: 0, hasPaymentSource: false })).toBe(70);
    const mild = riskScore({ bookedRevenue: 100000, overdue: 10000, shortPaid: 0, hasPaymentSource: true });
    const severe = riskScore({ bookedRevenue: 100000, overdue: 60000, shortPaid: 20000, hasPaymentSource: true });
    expect(mild).toBeGreaterThan(0);
    expect(severe).toBeGreaterThan(mild);
    expect(severe).toBeLessThanOrEqual(100);
  });
});
