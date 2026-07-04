import type {
  Decision,
  PaymentStatusKind,
  ProfitTruth,
  VerificationStatus,
} from "@/domain/decisions/config";

// Dataset the truth engine computes over. The server assembles this from the
// database; tests hand-craft it. Everything is plain data, no IO.

export interface TruthLead {
  id: string;
  campaignId: string;
  buyerId: string | null;
  supplierId: string;
  status: string;
  state: string | null;
  salePriceCents: number | null;
  supplierCostCents: number | null;
  paidAllocatedCents: number; // verified income allocated to this lead
  supplierPaidCents: number; // supplier cost verified paid for this lead
  isTest: boolean;
  receivedAt: string; // YYYY-MM-DD
  soldAt: string | null;
  returnedAt: string | null;
  paymentDueDate: string | null;
}

export interface TruthSpendRow {
  date: string;
  platform: "meta" | "google" | "tiktok";
  mappedCampaignId: string | null;
  brand: string | null;
  spendCents: number;
  paidStatus: "tracked" | "paid_verified" | "unverified";
  impressions: number;
  clicks: number;
}

export interface TruthCostRow {
  date: string;
  campaignId: string | null;
  supplierId: string | null;
  amountCents: number;
  paidStatus: "accrued" | "paid";
  category: string;
}

export interface TruthAttemptRow {
  leadId: string;
  buyerId: string;
  outcome: "accepted" | "rejected" | "timeout" | "error";
  attemptType: "ping" | "post" | "delivery";
  durationMs: number;
  date: string; // YYYY-MM-DD
}

export interface TruthPeriodRow {
  counterpartyType: "buyer" | "supplier";
  counterpartyId: string;
  granularity: "week" | "month";
  periodStart: string;
  periodEnd: string;
  expectedCents: number;
  paidCents: number;
  varianceCents: number;
  status: string;
}

export interface TruthPaymentRow {
  direction: "in" | "out";
  amountCents: number;
  matchStatus: string;
  date: string;
}

export type ConnectorMap = Partial<Record<string, "active" | "inactive" | "error">>;

export interface EntityMeta {
  id: string;
  name: string;
  paymentTermsDays?: number;
  extra?: Record<string, string | number | null>;
}

export interface TruthDataset {
  leads: TruthLead[];
  spend: TruthSpendRow[];
  costs: TruthCostRow[];
  attempts: TruthAttemptRow[];
  periods: TruthPeriodRow[];
  payments: TruthPaymentRow[];
  connectors: ConnectorMap;
  campaigns: EntityMeta[];
  buyers: EntityMeta[];
  suppliers: EntityMeta[];
  today: string; // YYYY-MM-DD, injected for determinism
}

export type TruthScope = "campaign" | "buyer" | "supplier" | "day" | "org" | "lead" | "state";

export interface TruthQuery {
  scope: TruthScope;
  range?: { from: string; to: string }; // on lead receivedAt / spend date
  filters?: {
    campaignIds?: string[];
    buyerIds?: string[];
    supplierIds?: string[];
    states?: string[];
    brands?: string[];
    platforms?: string[];
  };
}

export interface PerformanceLayer {
  leads: number;
  sold: number;
  sold_rate: number | null;
  dq_rate: number | null;
  return_rate: number | null;
  duplicate_rate: number | null;
  accept_rate: number | null;
  avg_response_ms: number | null;
}

export interface BookedLayer {
  booked_revenue: number;
  supplier_cost_accrued: number;
  media_cost_tracked: number | null; // null when the spend source is inactive
  other_costs: number;
  reported_profit: number | null;
  booked_margin: number | null;
  reported_cpl: number | null;
}

export interface VerifiedLayer {
  verified_income: number | null; // null = payment feeds inactive (UNKNOWN)
  supplier_cost_paid: number | null;
  media_spend_paid: number | null;
  cash_profit: number | null;
  cash_margin: number | null;
  true_cpl: number | null;
}

export interface GapLayer {
  revenue_gap: number | null;
  supplier_cost_gap: number | null;
  spend_gap: number | null;
  profit_gap: number | null;
  outstanding: number | null;
  due_soon: number | null;
  overdue: number | null;
  short_paid: number | null;
  unmatched_in: number | null;
  unmatched_out: number | null;
  payment_status: PaymentStatusKind;
  verification_status: VerificationStatus;
  data_quality: number; // 0-100
  action_needed: boolean;
  missing_sources: string[];
}

export interface TruthRow {
  key: string; // entity id, date, or state code
  name: string;
  scope: TruthScope;
  performance: PerformanceLayer;
  booked: BookedLayer;
  verified: VerifiedLayer;
  gap: GapLayer;
  profit_truth: ProfitTruth;
  decision: Decision | null; // campaigns only
  meta?: Record<string, string | number | null>;
}

export interface TruthResult {
  rows: TruthRow[];
  totals: TruthRow;
  generatedAt: string;
}
