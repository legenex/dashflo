import {
  TRUTH_THRESHOLDS as T,
  type Decision,
  type PaymentStatusKind,
  type ProfitTruth,
} from "./config";

// Profit truth and decision classifiers. Pure, boundary-tested.

export interface ProfitTruthInput {
  bookedRevenue: number;
  verifiedIncome: number | null; // null = payment source inactive
  reportedProfit: number | null;
  cashProfit: number | null;
  spendTracked: number | null;
  spendPaidVerified: number | null;
  anyBookedPastTerms: boolean; // some booked revenue is past its payment terms window
  missingRequiredSource: boolean;
}

export function classifyProfitTruth(input: ProfitTruthInput): ProfitTruth {
  if (input.missingRequiredSource || input.verifiedIncome === null) return "unknown";

  const verifiedShare =
    input.bookedRevenue > 0 ? input.verifiedIncome / input.bookedRevenue : null;

  // Zero verified income splits on the terms window: money that is late is
  // false profit (the books claim profit that never arrived), money that is
  // simply not due yet is At-Risk.
  if (input.bookedRevenue > 0 && input.verifiedIncome === 0) {
    if (input.reportedProfit !== null && input.reportedProfit > 0 && input.anyBookedPastTerms) {
      return "false_profit";
    }
    return "at_risk";
  }

  // False profit: reported profit is positive while cash reality disagrees.
  if (input.reportedProfit !== null && input.reportedProfit > 0) {
    const cashNegative = input.cashProfit !== null && input.cashProfit < 0;
    const verifiedThin =
      verifiedShare !== null &&
      verifiedShare < T.falseProfitMaxVerifiedShare &&
      input.anyBookedPastTerms;
    if (cashNegative || verifiedThin) return "false_profit";
  }

  if (verifiedShare !== null && verifiedShare >= T.cashVerifiedMinVerifiedShare) {
    const spendFullyVerified =
      input.spendTracked === null ||
      input.spendTracked === 0 ||
      (input.spendPaidVerified !== null && input.spendPaidVerified >= input.spendTracked * 0.9);
    if (spendFullyVerified) return "cash_verified";
    return "estimated";
  }

  if (verifiedShare !== null && verifiedShare >= T.estimatedMinVerifiedShare) return "estimated";

  return "booked";
}

export interface DecisionInput {
  soldRate: number | null;
  cashMargin: number | null;
  bookedMargin: number | null;
  verifiedIncome: number | null;
  bookedRevenue: number;
  trueCplCents: number | null;
  returnDqRate: number | null;
  spendMappedAndPaid: boolean; // tracked spend exists and is >=90% paid verified
  supplierCostConfident: boolean;
  missingMoneySource: boolean;
  revenueOverduePastTerms: boolean;
  shortPaid: boolean;
}

export function classifyDecision(input: DecisionInput): Decision {
  if (input.missingMoneySource) return "needs_source";

  const hasVerified = input.verifiedIncome !== null && input.verifiedIncome > 0;

  // Cut: verified reality is bad, or money is not arriving.
  if (
    (hasVerified && input.cashMargin !== null && input.cashMargin < 0) ||
    (input.trueCplCents !== null && input.trueCplCents > T.cutTrueCplCeilingCents) ||
    ((input.revenueOverduePastTerms || input.shortPaid) && input.bookedRevenue > 0 && !hasVerified)
  ) {
    return "cut";
  }

  // Scale: everything verified and strong.
  if (
    input.soldRate !== null &&
    input.soldRate >= T.scaleMinSoldRate &&
    input.cashMargin !== null &&
    input.cashMargin >= T.scaleMinCashMargin &&
    hasVerified &&
    input.spendMappedAndPaid &&
    input.supplierCostConfident &&
    (input.returnDqRate === null || input.returnDqRate < T.scaleMaxReturnDqRate)
  ) {
    return "scale";
  }

  // Review: books look strong but verification is weak.
  if (
    input.bookedRevenue > 0 &&
    input.bookedMargin !== null &&
    input.bookedMargin >= T.reviewMinBookedMargin &&
    (!hasVerified ||
      (input.verifiedIncome !== null && input.verifiedIncome < input.bookedRevenue * 0.5))
  ) {
    return "review";
  }

  return "watch";
}

export interface PaymentStatusInput {
  bookedRevenue: number;
  verifiedIncome: number | null;
  outstanding: number | null;
  overdue: number | null;
  dueSoon: number | null;
  shortPaid: number | null;
  hasPaymentSource: boolean;
  hasUnmatchedSuggestions: boolean;
}

export function classifyPaymentStatus(input: PaymentStatusInput): PaymentStatusKind {
  if (input.bookedRevenue <= 0) return "not_applicable";
  if (!input.hasPaymentSource) return "no_payment_source";
  if (input.shortPaid !== null && input.shortPaid > 0) return "short_paid";
  if (input.overdue !== null && input.overdue > 0) return "overdue";
  if (input.verifiedIncome !== null && input.verifiedIncome >= input.bookedRevenue * 0.99) {
    return "verified_paid";
  }
  if (input.dueSoon !== null && input.dueSoon > 0) return "due_soon";
  if (input.hasUnmatchedSuggestions) return "needs_matching";
  if (input.verifiedIncome !== null && input.verifiedIncome > 0) return "partially_paid";
  return "watch";
}

// Buyer risk score 0-100: overdue and short-pay balances relative to booked.
export function riskScore(args: {
  bookedRevenue: number;
  overdue: number;
  shortPaid: number;
  hasPaymentSource: boolean;
}): number {
  if (args.bookedRevenue <= 0) return 0;
  if (!args.hasPaymentSource) return 70;
  const overdueShare = Math.min(1, args.overdue / args.bookedRevenue);
  const shortShare = Math.min(1, args.shortPaid / args.bookedRevenue);
  const raw = 100 * (overdueShare * T.riskOverdueWeight + shortShare * T.riskShortPayWeight) * 2.5;
  return Math.min(100, Math.round(raw));
}
