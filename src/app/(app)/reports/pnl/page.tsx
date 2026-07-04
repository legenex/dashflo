import { requireOrg } from "@/server/org";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { startOfMonthKey, endOfMonthKey, addDays, toDateKey } from "@/lib/transforms";
import { PnlClient } from "./PnlClient";
import type { TruthRow } from "@/domain/truth/types";

export const dynamic = "force-dynamic";

export default async function PnlPage() {
  const ctx = await requireOrg();
  const dataset = await assembleTruthDataset(ctx.organizationId);

  // Six months of periods, newest first.
  const months: Array<{ start: string; end: string }> = [];
  let cursor = startOfMonthKey(dataset.today);
  for (let i = 0; i < 6; i++) {
    months.push({ start: cursor, end: endOfMonthKey(cursor) });
    cursor = startOfMonthKey(toDateKey(addDays(new Date(`${cursor}T00:00:00Z`), -1)));
  }

  const summarize = (row: TruthRow) => ({
    performance: {
      leads: row.performance.leads,
      sold: row.performance.sold,
      soldRate: row.performance.sold_rate,
    },
    booked: {
      revenue: row.booked.booked_revenue,
      supplierCost: row.booked.supplier_cost_accrued,
      media: row.booked.media_cost_tracked,
      other: row.booked.other_costs,
      profit: row.booked.reported_profit,
    },
    verified: {
      income: row.verified.verified_income,
      supplierPaid: row.verified.supplier_cost_paid,
      mediaPaid: row.verified.media_spend_paid,
      cashProfit: row.verified.cash_profit,
    },
    gap: {
      revenueGap: row.gap.revenue_gap,
      profitGap: row.gap.profit_gap,
      overdue: row.gap.overdue,
      shortPaid: row.gap.short_paid,
      spendGap: row.gap.spend_gap,
      supplierGap: row.gap.supplier_cost_gap,
      missingSources: row.gap.missing_sources,
    },
    profitTruth: row.profit_truth,
  });

  const periods = months.map(({ start, end }) => {
    const orgRow = computeTruth(dataset, { scope: "org", range: { from: start, to: end } }).totals;
    const campaigns = computeTruth(dataset, { scope: "campaign", range: { from: start, to: end } }).rows;
    const buyersByCampaign = Object.fromEntries(
      campaigns.map((c) => {
        const buyerRows = computeTruth(dataset, {
          scope: "buyer",
          range: { from: start, to: end },
          filters: { campaignIds: [c.key] },
        }).rows;
        return [c.key, buyerRows.map((b) => ({ name: b.name, ...summarize(b) }))];
      })
    );
    return {
      month: start.slice(0, 7),
      totals: summarize(orgRow),
      campaigns: campaigns.map((c) => ({ key: c.key, name: c.name, ...summarize(c) })),
      buyersByCampaign,
    };
  });

  return <PnlClient periods={periods} />;
}
