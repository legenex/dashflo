import { desc, eq, and } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { resolveRange } from "@/lib/date-range";
import { schema } from "@/db/client";
import { connectorImpact } from "@/ai/tools";
import { OverviewClient } from "./OverviewClient";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const range = resolveRange(params);
  const compare = params.compare === "1";

  const dataset = await assembleTruthDataset(ctx.organizationId);
  const q = { scope: "org" as const, range: { from: range.from, to: range.to } };
  const org = computeTruth(dataset, q);
  const prev = compare
    ? computeTruth(dataset, { scope: "org", range: { from: range.prevFrom, to: range.prevTo } })
    : null;
  const byDay = computeTruth(dataset, { scope: "day", range: { from: range.from, to: range.to } });
  const byCampaign = computeTruth(dataset, { scope: "campaign", range: { from: range.from, to: range.to } });
  const byBuyer = computeTruth(dataset, { scope: "buyer" });

  const [actionItems, connectors, recentLead, errorsToday] = await Promise.all([
    ctx.db.query.actionItems.findMany({
      where: and(eq(schema.actionItems.organizationId, ctx.organizationId), eq(schema.actionItems.status, "open")),
      orderBy: desc(schema.actionItems.amountAtRiskCents),
    }),
    ctx.db.query.connectorStatuses.findMany({
      where: eq(schema.connectorStatuses.organizationId, ctx.organizationId),
    }),
    ctx.db.query.leads.findFirst({
      where: eq(schema.leads.organizationId, ctx.organizationId),
      orderBy: desc(schema.leads.receivedAt),
    }),
    Promise.resolve(
      dataset.leads.filter((l) => l.status === "error" && l.receivedAt === dataset.today).length
    ),
  ]);

  // Daily chart series.
  const chartData = byDay.rows
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((row) => ({
      date: row.key.slice(5),
      booked: Math.round(row.booked.booked_revenue / 100),
      verified: row.verified.verified_income === null ? null : Math.round(row.verified.verified_income / 100),
      spend: row.booked.media_cost_tracked === null ? null : Math.round(row.booked.media_cost_tracked / 100),
    }));

  // Leads by status.
  const statusCounts = new Map<string, number>();
  for (const lead of dataset.leads) {
    if (lead.isTest) continue;
    if (lead.receivedAt < range.from || lead.receivedAt > range.to) continue;
    statusCounts.set(lead.status, (statusCounts.get(lead.status) ?? 0) + 1);
  }

  const openVariances = dataset.periods.filter((p) => p.status === "variance_flagged" && p.granularity === "month").length;

  const delta = (current: number | null, previous: number | null | undefined): number | null => {
    if (!compare || current === null || previous === null || previous === undefined || previous === 0) return null;
    return (current - previous) / Math.abs(previous);
  };

  const t = org.totals;
  const p = prev?.totals;

  return (
    <OverviewClient
      rangeLabel={range.label}
      totals={{
        bookedRevenue: t.booked.booked_revenue,
        verifiedIncome: t.verified.verified_income,
        reportedProfit: t.booked.reported_profit,
        cashProfit: t.verified.cash_profit,
        spendTracked: t.booked.media_cost_tracked,
        spendPaid: t.verified.media_spend_paid,
        supplierAccrued: t.booked.supplier_cost_accrued,
        supplierPaid: t.verified.supplier_cost_paid,
        outstanding: t.gap.outstanding,
        dueSoon: t.gap.due_soon,
        overdue: t.gap.overdue,
        shortPaid: t.gap.short_paid,
        trueCpl: t.verified.true_cpl,
        cashMargin: t.verified.cash_margin,
        dataQuality: t.gap.data_quality,
        unmatchedIn: t.gap.unmatched_in,
        deltas: {
          booked: delta(t.booked.booked_revenue, p?.booked.booked_revenue),
          verified: delta(t.verified.verified_income, p?.verified.verified_income),
          profit: delta(t.booked.reported_profit, p?.booked.reported_profit),
          cash: delta(t.verified.cash_profit, p?.verified.cash_profit),
        },
      }}
      chartData={chartData}
      statusData={[...statusCounts.entries()].map(([name, value]) => ({ name, value }))}
      topCampaigns={byCampaign.rows.slice(0, 5).map((r) => ({
        id: r.key, name: r.name,
        cashProfit: r.verified.cash_profit, bookedProfit: r.booked.reported_profit,
        decision: r.decision, profitTruth: r.profit_truth,
      }))}
      actionQueue={actionItems.slice(0, 10).map((a) => ({
        id: a.id, issueType: a.issueType, entityName: a.entityName, priority: a.priority,
        amountAtRiskCents: a.amountAtRiskCents, description: a.description,
      }))}
      totalAtRisk={actionItems.reduce((s, a) => s + (a.amountAtRiskCents ?? 0), 0)}
      buyerRisk={byBuyer.rows
        .filter((r) => (r.gap.outstanding ?? 0) > 0 || r.gap.payment_status === "no_payment_source")
        .sort((a, b) => ((b.gap.overdue ?? 0) + (b.gap.short_paid ?? 0)) - ((a.gap.overdue ?? 0) + (a.gap.short_paid ?? 0)))
        .slice(0, 5)
        .map((r) => ({
          id: r.key, name: r.name,
          outstanding: r.gap.outstanding, overdue: r.gap.overdue, shortPaid: r.gap.short_paid,
          paymentStatus: r.gap.payment_status, booked: r.booked.booked_revenue,
          verified: r.verified.verified_income,
        }))}
      connectors={connectors.map((c) => ({
        provider: c.provider, status: c.status,
        lastSyncAt: c.lastSyncAt?.toISOString() ?? null, coveragePct: c.coveragePct,
        impact: connectorImpact(c.provider, c.status),
      }))}
      health={{
        lastLeadAt: recentLead?.receivedAt.toISOString() ?? null,
        errorsToday,
        openVariances,
        queueDepth: dataset.payments.filter((pay) => pay.matchStatus === "unmatched").length,
      }}
    />
  );
}
