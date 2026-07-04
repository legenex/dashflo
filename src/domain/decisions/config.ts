// Every decision and profit-truth threshold lives here so tuning is one edit.

export const TRUTH_THRESHOLDS = {
  // Profit truth classification
  cashVerifiedMinVerifiedShare: 0.9, // >=90% of booked revenue verified for Cash-Verified
  falseProfitMaxVerifiedShare: 0.5, // <50% verified past terms while reported profit > 0
  estimatedMinVerifiedShare: 0.05, // any real verification above this is Estimated territory

  // Decision classifier (campaigns)
  scaleMinSoldRate: 0.25, // sold rate to consider scaling
  scaleMinCashMargin: 0.3, // cash margin to consider scaling
  scaleMaxReturnDqRate: 0.15, // returns + dq must stay under this
  cutTrueCplCeilingCents: 15000, // true CPL above $150 is a cut signal for legal verticals
  reviewMinBookedMargin: 0.2, // booked margin considered "strong" when verified is weak

  // Payment risk
  dueSoonWindowDays: 7,
  riskOverdueWeight: 0.6, // share of risk score driven by overdue balance
  riskShortPayWeight: 0.4,

  // Data quality scoring deductions (0-100 scale)
  dqMissingPaymentFeed: 40,
  dqMissingSpendFeed: 25,
  dqUnverifiedSpendShare: 15, // applied when >30% of tracked spend is unverified
  dqUnmappedSpend: 10,
  dqMissingSupplierStatements: 10,
} as const;

export type Decision = "scale" | "cut" | "needs_source" | "review" | "watch";
export type ProfitTruth =
  | "cash_verified"
  | "booked"
  | "estimated"
  | "at_risk"
  | "unknown"
  | "false_profit";
export type PaymentStatusKind =
  | "verified_paid"
  | "partially_paid"
  | "due_soon"
  | "overdue"
  | "short_paid"
  | "no_payment_source"
  | "needs_matching"
  | "watch"
  | "not_applicable";
export type VerificationStatus = "verified" | "partial" | "unverified" | "needs_source";
