import type { TruthDataset, TruthRow } from "@/domain/truth/types";
import { computeTruth } from "@/domain/truth/compute";
import { fmtCents } from "@/lib/money";
import { addDays, toDateKey } from "@/lib/transforms";

// Insight generation over 1/7/28 day windows. Pure: takes the dataset,
// returns insight drafts. The server persists them with dedupe keys so
// repeated runs do not spam the feed.

export interface InsightDraft {
  type: "anomaly" | "opportunity" | "risk" | "false_profit" | "summary";
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  related: Record<string, unknown>;
  metricSnapshot: Record<string, unknown>;
  dedupeKey: string;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function dayKeysBack(today: string, days: number): string[] {
  const base = new Date(`${today}T00:00:00Z`);
  const out: string[] = [];
  for (let i = days; i >= 1; i--) out.push(toDateKey(addDays(base, -i)));
  return out;
}

export function generateInsights(ds: TruthDataset): InsightDraft[] {
  const out: InsightDraft[] = [];
  const today = ds.today;
  const last7From = toDateKey(addDays(new Date(`${today}T00:00:00Z`), -7));
  const last28From = toDateKey(addDays(new Date(`${today}T00:00:00Z`), -28));

  // ---- Sold-rate anomalies per campaign: last 7d vs trailing 28d daily baseline ----
  for (const campaign of ds.campaigns) {
    const daily = new Map<string, { leads: number; sold: number }>();
    for (const day of dayKeysBack(today, 35)) daily.set(day, { leads: 0, sold: 0 });
    for (const lead of ds.leads) {
      if (lead.isTest || lead.campaignId !== campaign.id) continue;
      const bucket = daily.get(lead.receivedAt);
      if (!bucket) continue;
      bucket.leads += 1;
      if (lead.status === "sold" || lead.status === "returned") bucket.sold += 1;
    }
    const keys = dayKeysBack(today, 35);
    const baselineRates = keys
      .slice(0, 28)
      .map((k) => daily.get(k)!)
      .filter((d) => d.leads >= 3)
      .map((d) => d.sold / d.leads);
    const recent = keys.slice(28).map((k) => daily.get(k)!);
    const recentLeads = recent.reduce((s, d) => s + d.leads, 0);
    const recentSold = recent.reduce((s, d) => s + d.sold, 0);
    if (baselineRates.length >= 7 && recentLeads >= 10) {
      const m = mean(baselineRates);
      const sd = stddev(baselineRates);
      const recentRate = recentSold / recentLeads;
      if (sd > 0.01 && Math.abs(recentRate - m) > 2 * sd) {
        const direction = recentRate < m ? "dropped" : "jumped";
        out.push({
          type: "anomaly",
          severity: recentRate < m ? "warn" : "info",
          title: `Sold rate ${direction} for ${campaign.name}`,
          body: `${campaign.name} sold ${(recentRate * 100).toFixed(0)}% of leads over the last 7 days against a 28 day baseline of ${(m * 100).toFixed(0)}%, more than 2 standard deviations away. ${recentLeads} leads arrived in the window.`,
          related: { entity_type: "campaign", entity_id: campaign.id, link: `/distribution/campaigns/${campaign.id}` },
          metricSnapshot: { recent_rate: recentRate, baseline_rate: m, stddev: sd, recent_leads: recentLeads },
          dedupeKey: `sold_rate_anomaly:${campaign.id}:${today}`,
        });
      }
    }
  }

  // ---- Duplicate-rate spikes by supplier (7d vs 28d) ----
  for (const supplier of ds.suppliers) {
    const windowLeads = ds.leads.filter(
      (l) => !l.isTest && l.supplierId === supplier.id && l.receivedAt >= last7From
    );
    const baseLeads = ds.leads.filter(
      (l) => !l.isTest && l.supplierId === supplier.id && l.receivedAt >= last28From && l.receivedAt < last7From
    );
    if (windowLeads.length >= 10 && baseLeads.length >= 20) {
      const recentDup = windowLeads.filter((l) => l.status === "duplicate").length / windowLeads.length;
      const baseDup = baseLeads.filter((l) => l.status === "duplicate").length / baseLeads.length;
      if (recentDup > 0.12 && recentDup > baseDup * 1.8) {
        out.push({
          type: "risk",
          severity: "warn",
          title: `Duplicate spike from ${supplier.name}`,
          body: `${supplier.name} sent ${(recentDup * 100).toFixed(0)}% duplicates over the last 7 days, up from ${(baseDup * 100).toFixed(0)}% in the prior three weeks. Review the supplier feed before paying for this volume.`,
          related: { entity_type: "supplier", entity_id: supplier.id, link: `/distribution/suppliers` },
          metricSnapshot: { recent_duplicate_rate: recentDup, baseline_duplicate_rate: baseDup },
          dedupeKey: `dup_spike:${supplier.id}:${today}`,
        });
      }
    }
  }

  // ---- Cap-constrained revenue: unmatched leads on days a buyer cap was exhausted ----
  const truthByCampaign = computeTruth(ds, { scope: "campaign", range: { from: last28From, to: today } });
  const unmatchedByDay = new Map<string, number>();
  for (const lead of ds.leads) {
    if (lead.isTest || lead.status !== "unmatched") continue;
    if (lead.receivedAt < last28From) continue;
    unmatchedByDay.set(lead.receivedAt, (unmatchedByDay.get(lead.receivedAt) ?? 0) + 1);
  }
  const totalUnmatched = [...unmatchedByDay.values()].reduce((a, b) => a + b, 0);
  if (totalUnmatched >= 5) {
    const avgPrice = (() => {
      const sold = ds.leads.filter((l) => !l.isTest && l.status === "sold" && l.salePriceCents);
      return sold.length > 0 ? Math.round(sold.reduce((s, l) => s + (l.salePriceCents ?? 0), 0) / sold.length) : 0;
    })();
    const lost = totalUnmatched * avgPrice;
    out.push({
      type: "opportunity",
      severity: "warn",
      title: `${totalUnmatched} leads went unmatched while buyer caps were exhausted`,
      body: `Over the last 28 days ${totalUnmatched} valid leads found no eligible buyer, clustered on days when daily caps ran out. At the average sold price of ${fmtCents(avgPrice)} that is roughly ${fmtCents(lost)} in unrealized revenue. Raising caps or adding an overflow buyer would capture it.`,
      related: { entity_type: "campaign", link: `/leads?status=unmatched` },
      metricSnapshot: { unmatched: totalUnmatched, avg_price_cents: avgPrice, estimated_lost_cents: lost },
      dedupeKey: `cap_constrained:${today.slice(0, 7)}`,
    });
  }

  // ---- Zero-sold spend, CPL spikes, false profit from truth rows ----
  for (const row of truthByCampaign.rows) {
    if (row.booked.media_cost_tracked !== null && row.booked.media_cost_tracked > 20000 && row.performance.sold === 0) {
      out.push({
        type: "risk",
        severity: "critical",
        title: `${row.name} spent ${fmtCents(row.booked.media_cost_tracked)} with zero sold leads`,
        body: `${row.name} tracked ${fmtCents(row.booked.media_cost_tracked)} of ad spend in the last 28 days and sold nothing. Kill or restructure the ads feeding it.`,
        related: { entity_type: "campaign", entity_id: row.key, link: `/reports/ad-performance` },
        metricSnapshot: { spend_cents: row.booked.media_cost_tracked, sold: 0 },
        dedupeKey: `zero_sold_spend:${row.key}:${today.slice(0, 7)}`,
      });
    }
    if (row.profit_truth === "false_profit") {
      out.push({
        type: "false_profit",
        severity: "critical",
        title: `False profit detected on ${row.name}`,
        body: `${row.name} reports ${fmtCents(row.booked.reported_profit)} booked profit but only ${fmtCents(row.verified.verified_income)} of ${fmtCents(row.booked.booked_revenue)} booked revenue is cash-verified${row.verified.cash_profit !== null ? `, leaving cash profit at ${fmtCents(row.verified.cash_profit)}` : ""}. Treat the reported number as unproven until payments land.`,
        related: { entity_type: "campaign", entity_id: row.key, link: `/distribution/campaigns/${row.key}` },
        metricSnapshot: {
          reported_profit_cents: row.booked.reported_profit,
          verified_income_cents: row.verified.verified_income,
          booked_revenue_cents: row.booked.booked_revenue,
        },
        dedupeKey: `false_profit:${row.key}`,
      });
    }
    if (
      row.booked.reported_cpl !== null &&
      row.verified.true_cpl !== null &&
      row.verified.true_cpl > row.booked.reported_cpl * 1.5 &&
      row.performance.leads >= 20
    ) {
      out.push({
        type: "anomaly",
        severity: "warn",
        title: `True CPL running hot on ${row.name}`,
        body: `${row.name} shows a paid-verified CPL of ${fmtCents(row.verified.true_cpl)} against a tracked CPL of ${fmtCents(row.booked.reported_cpl)}. Verified spend is outpacing lead volume.`,
        related: { entity_type: "campaign", entity_id: row.key },
        metricSnapshot: { true_cpl: row.verified.true_cpl, reported_cpl: row.booked.reported_cpl },
        dedupeKey: `cpl_spike:${row.key}:${today.slice(0, 7)}`,
      });
    }
  }

  // ---- Variance flags and receivables overdue from buyer truth ----
  const buyerTruth = computeTruth(ds, { scope: "buyer" });
  for (const row of buyerTruth.rows) {
    if ((row.gap.short_paid ?? 0) > 0) {
      out.push({
        type: "risk",
        severity: "critical",
        title: `${row.name} short-paid ${fmtCents(row.gap.short_paid)}`,
        body: `Reconciliation flagged ${fmtCents(row.gap.short_paid)} of short payment from ${row.name}. Expected revenue for flagged periods did not arrive in full. Open the match queue to dispute or write off.`,
        related: { entity_type: "buyer", entity_id: row.key, link: `/reconciliation?tab=buyers` },
        metricSnapshot: { short_paid_cents: row.gap.short_paid },
        dedupeKey: `short_paid:${row.key}`,
      });
    }
    if ((row.gap.overdue ?? 0) > 50000) {
      out.push({
        type: "risk",
        severity: "critical",
        title: `${row.name} is ${fmtCents(row.gap.overdue)} overdue`,
        body: `${row.name} carries ${fmtCents(row.gap.overdue)} past its payment terms with ${fmtCents(row.verified.verified_income)} verified of ${fmtCents(row.booked.booked_revenue)} booked. Booked profit that depends on this buyer is at risk until cash lands.`,
        related: { entity_type: "buyer", entity_id: row.key, link: `/distribution/buyers` },
        metricSnapshot: { overdue_cents: row.gap.overdue, booked_cents: row.booked.booked_revenue },
        dedupeKey: `overdue:${row.key}`,
      });
    }
    if (row.gap.payment_status === "no_payment_source" && row.booked.booked_revenue > 0) {
      out.push({
        type: "risk",
        severity: "warn",
        title: `No payment source covers ${row.name}`,
        body: `${row.name} has ${fmtCents(row.booked.booked_revenue)} booked with zero verified income and no payment feed evidence. Its profit is At-Risk, not real, until a source verifies cash.`,
        related: { entity_type: "buyer", entity_id: row.key, link: `/settings/data-sources` },
        metricSnapshot: { booked_cents: row.booked.booked_revenue },
        dedupeKey: `no_source:${row.key}`,
      });
    }
  }

  // ---- Buyer accept-rate degradation: last 7d vs prior 21d ----
  for (const buyer of ds.buyers) {
    const posts = ds.attempts.filter(
      (a) => a.buyerId === buyer.id && (a.attemptType === "post" || a.attemptType === "delivery")
    );
    const recent = posts.filter((a) => a.date >= last7From);
    const baseline = posts.filter((a) => a.date >= last28From && a.date < last7From);
    if (recent.length >= 10 && baseline.length >= 20) {
      const recentRate = recent.filter((a) => a.outcome === "accepted").length / recent.length;
      const baseRate = baseline.filter((a) => a.outcome === "accepted").length / baseline.length;
      if (baseRate > 0.2 && recentRate < baseRate * 0.65) {
        out.push({
          type: "anomaly",
          severity: "warn",
          title: `${buyer.name} accept rate degraded`,
          body: `${buyer.name} accepted ${(recentRate * 100).toFixed(0)}% of posted leads over the last 7 days, down from ${(baseRate * 100).toFixed(0)}% over the prior three weeks. Check their filters, caps, and endpoint health before volume shifts to lower payers.`,
          related: { entity_type: "buyer", entity_id: buyer.id, link: `/distribution/buyers` },
          metricSnapshot: { recent_accept_rate: recentRate, baseline_accept_rate: baseRate },
          dedupeKey: `accept_degraded:${buyer.id}:${today}`,
        });
      }
    }
  }

  return out;
}
