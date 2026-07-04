import { TRUTH_THRESHOLDS as T } from "@/domain/decisions/config";
import {
  classifyDecision,
  classifyPaymentStatus,
  classifyProfitTruth,
} from "@/domain/decisions/classify";
import { addDays, toDateKey } from "@/lib/transforms";
import type {
  TruthDataset,
  TruthLead,
  TruthQuery,
  TruthResult,
  TruthRow,
  TruthScope,
  TruthSpendRow,
} from "./types";

// The truth engine. One pass groups the dataset by scope key, a second pass
// computes the four layers per group. Missing sources force null (UNKNOWN),
// never zero. Correctness beats cleverness throughout.

const MONEY_STATUSES = new Set(["sold", "returned"]);
const COUNTED_STATUSES = new Set([
  "received", "queued", "pinged", "sold", "unsold", "unmatched", "rejected", "duplicate", "error", "returned",
]);

function inRange(date: string, range?: { from: string; to: string }): boolean {
  if (!range) return true;
  return date >= range.from && date <= range.to;
}

function leadPasses(lead: TruthLead, q: TruthQuery): boolean {
  if (lead.isTest) return false;
  if (!COUNTED_STATUSES.has(lead.status)) return false;
  if (!inRange(lead.receivedAt, q.range)) return false;
  const f = q.filters;
  if (f?.campaignIds && f.campaignIds.length > 0 && !f.campaignIds.includes(lead.campaignId)) return false;
  if (f?.buyerIds && f.buyerIds.length > 0 && (lead.buyerId === null || !f.buyerIds.includes(lead.buyerId))) return false;
  if (f?.supplierIds && f.supplierIds.length > 0 && !f.supplierIds.includes(lead.supplierId)) return false;
  if (f?.states && f.states.length > 0 && (lead.state === null || !f.states.includes(lead.state))) return false;
  return true;
}

function spendPasses(row: TruthSpendRow, q: TruthQuery): boolean {
  if (!inRange(row.date, q.range)) return false;
  const f = q.filters;
  if (f?.campaignIds && f.campaignIds.length > 0) {
    if (row.mappedCampaignId === null || !f.campaignIds.includes(row.mappedCampaignId)) return false;
  }
  if (f?.brands && f.brands.length > 0 && (row.brand === null || !f.brands.includes(row.brand))) return false;
  if (f?.platforms && f.platforms.length > 0 && !f.platforms.includes(row.platform)) return false;
  return true;
}

function leadKeys(lead: TruthLead, scope: TruthScope): string[] {
  switch (scope) {
    case "campaign": return [lead.campaignId];
    case "buyer": return lead.buyerId ? [lead.buyerId] : [];
    case "supplier": return [lead.supplierId];
    case "day": return [lead.receivedAt];
    case "state": return lead.state ? [lead.state] : [];
    case "lead": return [lead.id];
    case "org": return ["org"];
  }
}

function spendKeys(row: TruthSpendRow, scope: TruthScope): string[] {
  switch (scope) {
    case "campaign": return row.mappedCampaignId ? [row.mappedCampaignId] : [];
    case "day": return [row.date];
    case "org": return ["org"];
    default: return []; // spend does not attribute to buyers, suppliers, states, leads
  }
}

const SPEND_CONNECTOR: Record<string, string> = {
  meta: "meta_ads",
  google: "google_ads",
  tiktok: "tiktok_ads",
};

interface Group {
  key: string;
  leads: TruthLead[];
  spend: TruthSpendRow[];
  otherCosts: number;
  otherCostsPaid: number;
}

function nameFor(key: string, scope: TruthScope, ds: TruthDataset): string {
  if (scope === "campaign") return ds.campaigns.find((c) => c.id === key)?.name ?? key;
  if (scope === "buyer") return ds.buyers.find((b) => b.id === key)?.name ?? key;
  if (scope === "supplier") return ds.suppliers.find((s) => s.id === key)?.name ?? key;
  if (scope === "org") return "Organization";
  return key;
}

export function computeTruth(ds: TruthDataset, q: TruthQuery): TruthResult {
  const paymentsActive = ds.connectors["stripe"] === "active" || ds.connectors["mercury"] === "active";
  const mercuryActive = ds.connectors["mercury"] === "active";

  const groups = new Map<string, Group>();
  const ensure = (key: string): Group => {
    let g = groups.get(key);
    if (!g) {
      g = { key, leads: [], spend: [], otherCosts: 0, otherCostsPaid: 0 };
      groups.set(key, g);
    }
    return g;
  };

  for (const lead of ds.leads) {
    if (!leadPasses(lead, q)) continue;
    for (const key of leadKeys(lead, q.scope)) ensure(key).leads.push(lead);
  }

  for (const row of ds.spend) {
    if (!spendPasses(row, q)) continue;
    for (const key of spendKeys(row, q.scope)) ensure(key).spend.push(row);
  }

  for (const cost of ds.costs) {
    if (!inRange(cost.date, q.range)) continue;
    if (cost.category === "media") continue; // media flows through spend records
    const keys =
      q.scope === "campaign" && cost.campaignId ? [cost.campaignId]
      : q.scope === "supplier" && cost.supplierId ? [cost.supplierId]
      : q.scope === "org" ? ["org"]
      : q.scope === "day" ? [cost.date]
      : [];
    for (const key of keys) {
      const g = ensure(key);
      g.otherCosts += cost.amountCents;
      if (cost.paidStatus === "paid") g.otherCostsPaid += cost.amountCents;
    }
  }

  // Attempts indexed by lead for response stats.
  const attemptsByLead = new Map<string, { accepted: number; posts: number; totalMs: number; count: number }>();
  for (const a of ds.attempts) {
    let s = attemptsByLead.get(a.leadId);
    if (!s) {
      s = { accepted: 0, posts: 0, totalMs: 0, count: 0 };
      attemptsByLead.set(a.leadId, s);
    }
    if (a.attemptType === "post" || a.attemptType === "delivery") {
      s.posts += 1;
      if (a.outcome === "accepted") s.accepted += 1;
    }
    s.totalMs += a.durationMs;
    s.count += 1;
  }

  const dueSoonCutoff = toDateKey(addDays(new Date(`${ds.today}T00:00:00Z`), T.dueSoonWindowDays));

  const rows: TruthRow[] = [];
  for (const g of groups.values()) {
    rows.push(computeRow(g, q.scope, ds, { paymentsActive, mercuryActive, dueSoonCutoff }));
  }

  rows.sort((a, b) => (b.verified.cash_profit ?? b.booked.reported_profit ?? 0) - (a.verified.cash_profit ?? a.booked.reported_profit ?? 0));

  // Totals: recompute over the union group so layer math stays consistent.
  const totalGroup: Group = {
    key: "org",
    leads: [...new Set(rows.flatMap(() => []))] as TruthLead[],
    spend: [],
    otherCosts: 0,
    otherCostsPaid: 0,
  };
  // Rebuild the union directly from the dataset with the same query filters.
  totalGroup.leads = ds.leads.filter((l) => leadPasses(l, q));
  totalGroup.spend = ds.spend.filter((s) => spendPasses(s, q));
  for (const cost of ds.costs) {
    if (!inRange(cost.date, q.range) || cost.category === "media") continue;
    totalGroup.otherCosts += cost.amountCents;
    if (cost.paidStatus === "paid") totalGroup.otherCostsPaid += cost.amountCents;
  }
  const totals = computeRow(totalGroup, "org", ds, { paymentsActive, mercuryActive, dueSoonCutoff });

  // Unmatched payment flows only make sense on totals.
  const unmatchedIn = ds.payments
    .filter((p) => p.direction === "in" && p.matchStatus === "unmatched" && inRange(p.date, q.range))
    .reduce((s, p) => s + p.amountCents, 0);
  const unmatchedOut = ds.payments
    .filter((p) => p.direction === "out" && p.matchStatus === "unmatched" && inRange(p.date, q.range))
    .reduce((s, p) => s + p.amountCents, 0);
  totals.gap.unmatched_in = paymentsActive ? unmatchedIn : null;
  totals.gap.unmatched_out = paymentsActive ? unmatchedOut : null;

  return { rows, totals, generatedAt: new Date().toISOString() };

  function computeRow(
    g: Group,
    scope: TruthScope,
    dataset: TruthDataset,
    flags: { paymentsActive: boolean; mercuryActive: boolean; dueSoonCutoff: string }
  ): TruthRow {
    const missingSources: string[] = [];

    // ---- performance ----
    const leadsCount = g.leads.length;
    const sold = g.leads.filter((l) => l.status === "sold" || l.status === "returned").length;
    const returned = g.leads.filter((l) => l.status === "returned").length;
    const duplicates = g.leads.filter((l) => l.status === "duplicate").length;
    const dq = g.leads.filter((l) => l.status === "rejected" || l.status === "error").length;

    let posts = 0;
    let accepted = 0;
    let totalMs = 0;
    let attemptCount = 0;
    for (const lead of g.leads) {
      const s = attemptsByLead.get(lead.id);
      if (!s) continue;
      posts += s.posts;
      accepted += s.accepted;
      totalMs += s.totalMs;
      attemptCount += s.count;
    }

    const performance = {
      leads: leadsCount,
      sold,
      sold_rate: leadsCount > 0 ? sold / leadsCount : null,
      dq_rate: leadsCount > 0 ? dq / leadsCount : null,
      return_rate: sold > 0 ? returned / sold : null,
      duplicate_rate: leadsCount > 0 ? duplicates / leadsCount : null,
      accept_rate: posts > 0 ? accepted / posts : null,
      avg_response_ms: attemptCount > 0 ? Math.round(totalMs / attemptCount) : null,
    };

    // ---- booked ----
    const moneyLeads = g.leads.filter((l) => MONEY_STATUSES.has(l.status));
    const activeSold = moneyLeads.filter((l) => l.status === "sold");
    const bookedRevenue = activeSold.reduce((s, l) => s + (l.salePriceCents ?? 0), 0);
    const supplierCostAccrued = g.leads
      .filter((l) => l.supplierCostCents !== null && l.status !== "duplicate" && l.status !== "error")
      .reduce((s, l) => s + (l.supplierCostCents ?? 0), 0);

    // Spend gating: rows whose platform connector is inactive are UNKNOWN.
    // All rows gated -> null. Mixed -> sum of known rows, source flagged.
    const spendExists = g.spend.length > 0;
    let knownSpend = 0;
    let knownPaid = 0;
    let gatedRows = 0;
    let knownRows = 0;
    let unverifiedSpend = 0;
    for (const row of g.spend) {
      const provider = SPEND_CONNECTOR[row.platform];
      if (dataset.connectors[provider] !== "active") {
        if (!missingSources.includes(provider)) missingSources.push(provider);
        gatedRows += 1;
        continue;
      }
      knownRows += 1;
      knownSpend += row.spendCents;
      if (row.paidStatus === "paid_verified") {
        knownPaid += row.spendCents;
      } else {
        unverifiedSpend += row.spendCents;
      }
    }
    const allSpendGated = spendExists && knownRows === 0 && gatedRows > 0;
    let mediaTracked: number | null = allSpendGated ? null : knownSpend;
    let mediaPaid: number | null = allSpendGated ? null : knownPaid;
    if (!flags.mercuryActive) {
      mediaPaid = spendExists ? null : mediaPaid;
      if (spendExists && !missingSources.includes("mercury")) missingSources.push("mercury");
    }

    const otherCosts = g.otherCosts;
    const reportedProfit =
      mediaTracked === null && spendExists
        ? null
        : bookedRevenue - supplierCostAccrued - (mediaTracked ?? 0) - otherCosts;
    const booked = {
      booked_revenue: bookedRevenue,
      supplier_cost_accrued: supplierCostAccrued,
      media_cost_tracked: spendExists ? mediaTracked : scope === "buyer" || scope === "supplier" || scope === "lead" ? null : 0,
      other_costs: otherCosts,
      reported_profit: reportedProfit,
      booked_margin: reportedProfit !== null && bookedRevenue > 0 ? reportedProfit / bookedRevenue : null,
      reported_cpl:
        leadsCount > 0 && spendExists && mediaTracked !== null ? Math.round(mediaTracked / leadsCount) : null,
    };

    // ---- verified ----
    if (!flags.paymentsActive) {
      if (!missingSources.includes("payments")) missingSources.push("payments");
    }
    const verifiedIncome = flags.paymentsActive
      ? activeSold.reduce((s, l) => s + l.paidAllocatedCents, 0)
      : null;
    const supplierCostPaid = flags.paymentsActive
      ? g.leads.reduce((s, l) => s + l.supplierPaidCents, 0)
      : null;
    const cashProfit =
      verifiedIncome === null || supplierCostPaid === null || (spendExists && mediaPaid === null)
        ? null
        : verifiedIncome - (mediaPaid ?? 0) - supplierCostPaid - g.otherCostsPaid;
    const trueCpl =
      leadsCount > 0 && spendExists && mediaPaid !== null && mediaPaid > 0
        ? Math.round(mediaPaid / leadsCount)
        : null;

    const verified = {
      verified_income: verifiedIncome,
      supplier_cost_paid: supplierCostPaid,
      media_spend_paid: spendExists ? mediaPaid : scope === "buyer" || scope === "supplier" || scope === "lead" ? null : 0,
      cash_profit: cashProfit,
      cash_margin: cashProfit !== null && verifiedIncome !== null && verifiedIncome > 0 ? cashProfit / verifiedIncome : null,
      true_cpl: trueCpl,
    };

    // ---- gap ----
    let outstanding: number | null = null;
    let dueSoon: number | null = null;
    let overdue: number | null = null;
    if (flags.paymentsActive) {
      outstanding = 0;
      dueSoon = 0;
      overdue = 0;
      for (const lead of activeSold) {
        const unpaid = (lead.salePriceCents ?? 0) - lead.paidAllocatedCents;
        if (unpaid <= 0) continue;
        outstanding += unpaid;
        if (lead.paymentDueDate) {
          if (lead.paymentDueDate < dataset.today) overdue += unpaid;
          else if (lead.paymentDueDate <= flags.dueSoonCutoff) dueSoon += unpaid;
        }
      }
    }

    // Short pay from flagged month periods for buyer/supplier scopes. A short
    // pay means the counterparty paid the period but light (paid > 0); fully
    // unpaid periods surface through overdue instead.
    let shortPaid: number | null = flags.paymentsActive ? 0 : null;
    let periodPaidEvidence = false;
    if (flags.paymentsActive && (scope === "buyer" || scope === "supplier")) {
      const cpType = scope;
      const mine = dataset.periods.filter(
        (p) => p.counterpartyType === cpType && p.counterpartyId === g.key && p.granularity === "month"
      );
      periodPaidEvidence = mine.some((p) => p.paidCents > 0);
      shortPaid = mine
        .filter((p) => p.status === "variance_flagged" && p.paidCents > 0 && p.varianceCents > 0)
        .reduce((s, p) => s + p.varianceCents, 0);
    } else if (flags.paymentsActive && scope === "org") {
      // Org totals aggregate every flagged short pay across counterparties.
      shortPaid = dataset.periods
        .filter((p) => p.granularity === "month" && p.status === "variance_flagged" && p.paidCents > 0 && p.varianceCents > 0)
        .reduce((s, p) => s + p.varianceCents, 0);
    }

    const revenueGap = verifiedIncome === null ? null : bookedRevenue - verifiedIncome;
    const supplierGap = supplierCostPaid === null ? null : supplierCostAccrued - supplierCostPaid;
    const spendGap =
      spendExists && mediaTracked !== null && mediaPaid !== null ? mediaTracked - mediaPaid : spendExists ? null : 0;
    const profitGap =
      reportedProfit !== null && cashProfit !== null ? reportedProfit - cashProfit : null;

    // Data quality score from source coverage.
    let dataQuality = 100;
    if (!flags.paymentsActive) dataQuality -= T.dqMissingPaymentFeed;
    if (spendExists && mediaTracked === null) dataQuality -= T.dqMissingSpendFeed;
    if (spendExists && !flags.mercuryActive) dataQuality -= T.dqMissingSpendFeed;
    if (
      spendExists &&
      mediaTracked !== null &&
      mediaTracked > 0 &&
      unverifiedSpend / mediaTracked > 0.3
    ) {
      dataQuality -= T.dqUnverifiedSpendShare;
    }
    if (dataset.connectors["supplier_statements"] !== "active" && supplierCostAccrued > 0) {
      dataQuality -= T.dqMissingSupplierStatements;
      if (!missingSources.includes("supplier_statements")) missingSources.push("supplier_statements");
    }
    dataQuality = Math.max(0, dataQuality);

    const anyBookedPastTerms = activeSold.some(
      (l) =>
        l.paymentDueDate !== null &&
        l.paymentDueDate < dataset.today &&
        (l.salePriceCents ?? 0) > l.paidAllocatedCents
    );

    const missingRequired = !flags.paymentsActive || (spendExists && mediaTracked === null);

    // Buyer and supplier rows check whether any payment evidence covers this
    // specific counterparty; the org feed being live does not prove a buyer
    // is covered by it.
    const hasEntitySource =
      scope === "buyer"
        ? flags.paymentsActive && ((verifiedIncome ?? 0) > 0 || periodPaidEvidence)
        : scope === "supplier"
          ? flags.paymentsActive && ((supplierCostPaid ?? 0) > 0 || periodPaidEvidence)
          : flags.paymentsActive;

    let profitTruth = classifyProfitTruth({
      bookedRevenue,
      verifiedIncome,
      reportedProfit,
      cashProfit,
      spendTracked: spendExists ? mediaTracked : null,
      spendPaidVerified: spendExists ? mediaPaid : null,
      anyBookedPastTerms,
      missingRequiredSource: missingRequired,
    });

    const paymentStatus = classifyPaymentStatus({
      bookedRevenue,
      verifiedIncome,
      outstanding,
      overdue,
      dueSoon,
      shortPaid,
      hasPaymentSource: hasEntitySource,
      hasUnmatchedSuggestions: false,
    });

    // With no payment source covering the entity, calling it false profit
    // overstates certainty: the honest state is At-Risk plus Needs Source.
    if (paymentStatus === "no_payment_source" && profitTruth === "false_profit") {
      profitTruth = "at_risk";
    }

    const decision =
      scope === "campaign"
        ? classifyDecision({
            soldRate: performance.sold_rate,
            cashMargin: verified.cash_margin,
            bookedMargin: booked.booked_margin,
            verifiedIncome,
            bookedRevenue,
            trueCplCents: trueCpl,
            returnDqRate:
              performance.dq_rate !== null || performance.return_rate !== null
                ? (performance.dq_rate ?? 0) + (performance.return_rate ?? 0) * (sold / Math.max(1, leadsCount))
                : null,
            spendMappedAndPaid:
              !spendExists ||
              (mediaTracked !== null && mediaPaid !== null && mediaTracked > 0 && mediaPaid >= mediaTracked * 0.9),
            supplierCostConfident: supplierGap === null ? false : supplierGap <= supplierCostAccrued * 0.1,
            missingMoneySource: missingRequired,
            revenueOverduePastTerms: anyBookedPastTerms,
            shortPaid: (shortPaid ?? 0) > 0,
          })
        : null;

    const verificationStatus = missingRequired
      ? ("needs_source" as const)
      : verifiedIncome !== null && bookedRevenue > 0 && verifiedIncome >= bookedRevenue * 0.99
        ? ("verified" as const)
        : verifiedIncome !== null && verifiedIncome > 0
          ? ("partial" as const)
          : ("unverified" as const);

    const actionNeeded =
      (overdue ?? 0) > 0 ||
      (shortPaid ?? 0) > 0 ||
      profitTruth === "false_profit" ||
      profitTruth === "at_risk" ||
      missingRequired;

    return {
      key: g.key,
      name: nameFor(g.key, scope, dataset),
      scope,
      performance,
      booked,
      verified,
      gap: {
        revenue_gap: revenueGap,
        supplier_cost_gap: supplierGap,
        spend_gap: spendGap,
        profit_gap: profitGap,
        outstanding,
        due_soon: dueSoon,
        overdue,
        short_paid: shortPaid,
        unmatched_in: null,
        unmatched_out: null,
        payment_status: paymentStatus,
        verification_status: verificationStatus,
        data_quality: dataQuality,
        action_needed: actionNeeded,
        missing_sources: missingSources,
      },
      profit_truth: profitTruth,
      decision,
    };
  }
}
