import { desc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { toDateKey } from "@/lib/transforms";
import { ReconciliationClient } from "./ReconciliationClient";

export const dynamic = "force-dynamic";

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const dataset = await assembleTruthDataset(ctx.organizationId);
  const orgTruth = computeTruth(dataset, { scope: "org" });
  const buyerTruth = computeTruth(dataset, { scope: "buyer" });

  const [payments, invoices, periods, rules, buyers, suppliers, actionItems] = await Promise.all([
    ctx.db.select().from(schema.paymentRecords).where(eq(schema.paymentRecords.organizationId, ctx.organizationId)).orderBy(desc(schema.paymentRecords.date)),
    ctx.db.query.invoices.findMany({ where: eq(schema.invoices.organizationId, ctx.organizationId) }),
    ctx.db.query.reconciliationPeriods.findMany({ where: eq(schema.reconciliationPeriods.organizationId, ctx.organizationId) }),
    ctx.db.query.matchRules.findMany({ where: eq(schema.matchRules.organizationId, ctx.organizationId) }),
    ctx.db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, ctx.organizationId) }),
    ctx.db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, ctx.organizationId) }),
    ctx.db.query.actionItems.findMany({ where: eq(schema.actionItems.organizationId, ctx.organizationId) }),
  ]);

  const nameOf = (type: string, id: string) =>
    type === "buyer" ? buyers.find((b) => b.id === id)?.name ?? id : suppliers.find((s) => s.id === id)?.name ?? id;

  const today = toDateKey(new Date());
  const t = orgTruth.totals;

  // Monthly cash strip from payments.
  const monthly = new Map<string, { cashIn: number; cashOut: number }>();
  for (const p of payments) {
    const key = p.date.slice(0, 7);
    const m = monthly.get(key) ?? { cashIn: 0, cashOut: 0 };
    if (p.direction === "in") m.cashIn += p.amountCents;
    else m.cashOut += p.amountCents;
    monthly.set(key, m);
  }
  const monthlyTruth = computeTruth(dataset, { scope: "day" });
  const reportedByMonth = new Map<string, number>();
  for (const row of monthlyTruth.rows) {
    const key = row.key.slice(0, 7);
    reportedByMonth.set(key, (reportedByMonth.get(key) ?? 0) + (row.booked.reported_profit ?? 0));
  }

  // Aging buckets over receivable invoices.
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  for (const inv of invoices) {
    if (inv.direction !== "receivable" || inv.status === "paid" || inv.status === "void") continue;
    const open = inv.amountCents - inv.amountPaidCents;
    if (open <= 0) continue;
    const daysLate = Math.floor((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${inv.dueDate}T00:00:00Z`).getTime()) / 86400000);
    if (daysLate <= 0) aging.current += open;
    else if (daysLate <= 30) aging.d30 += open;
    else if (daysLate <= 60) aging.d60 += open;
    else if (daysLate <= 90) aging.d90 += open;
    else aging.d90plus += open;
  }

  const flagged = periods.filter((p) => p.status === "variance_flagged" && p.granularity === "month");

  return (
    <ReconciliationClient
      initialTab={params.tab ?? "overview"}
      overview={{
        revenueGap: t.gap.revenue_gap,
        unmatchedIn: t.gap.unmatched_in,
        unmatchedOut: t.gap.unmatched_out,
        outstanding: t.gap.outstanding,
        overdue: t.gap.overdue,
        openGaps: flagged.map((p) => ({
          id: p.id,
          counterparty: nameOf(p.counterpartyType, p.counterpartyId),
          type: p.counterpartyType,
          period: `${p.periodStart} to ${p.periodEnd}`,
          expectedCents: p.expectedCents,
          paidCents: p.paidCents,
          varianceCents: p.varianceCents,
        })),
        oldestUnresolved: flagged.sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1))[0]?.periodStart ?? null,
        resolvedCount: actionItems.filter((a) => a.status === "resolved").length,
        openCount: actionItems.filter((a) => a.status === "open").length,
      }}
      bankFeed={payments
        .filter((p) => p.source === "mercury")
        .map((p) => ({
          id: p.id, date: p.date, amountCents: p.amountCents, direction: p.direction,
          counterpartyName: p.counterpartyName, memo: p.memo, matchStatus: p.matchStatus,
        }))}
      monthlyStrip={[...monthly.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([month, m]) => ({
          month, cashIn: m.cashIn, cashOut: m.cashOut, net: m.cashIn - m.cashOut,
          reportedProfit: reportedByMonth.get(month) ?? 0,
        }))}
      invoices={invoices.map((inv) => ({
        id: inv.id, direction: inv.direction, counterparty: nameOf(inv.counterpartyType, inv.counterpartyId),
        counterpartyType: inv.counterpartyType, externalRef: inv.externalRef, source: inv.source,
        issueDate: inv.issueDate, dueDate: inv.dueDate, amountCents: inv.amountCents,
        amountPaidCents: inv.amountPaidCents, status: inv.status,
      }))}
      aging={aging}
      buyerPeriods={periods
        .filter((p) => p.counterpartyType === "buyer")
        .map((p) => ({ ...serializePeriod(p), counterparty: nameOf("buyer", p.counterpartyId) }))}
      supplierPeriods={periods
        .filter((p) => p.counterpartyType === "supplier")
        .map((p) => ({ ...serializePeriod(p), counterparty: nameOf("supplier", p.counterpartyId) }))}
      spendMatching={buildSpendMatching(dataset)}
      rules={rules.map((r) => ({
        id: r.id, name: r.name, counterpartyPattern: r.counterpartyPattern,
        amountTolerancePct: r.amountTolerancePct, dateWindowDays: r.dateWindowDays,
        target: r.target, targetId: r.targetId, active: r.active,
      }))}
      buyerNames={buyers.map((b) => ({ id: b.id, name: b.name }))}
      supplierNames={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      buyerOverdueByName={Object.fromEntries(buyerTruth.rows.map((r) => [r.name, r.gap.overdue ?? 0]))}
    />
  );
}

function serializePeriod(p: typeof schema.reconciliationPeriods.$inferSelect) {
  return {
    id: p.id, counterpartyId: p.counterpartyId, granularity: p.granularity,
    periodStart: p.periodStart, periodEnd: p.periodEnd,
    expectedCents: p.expectedCents, invoicedCents: p.invoicedCents, paidCents: p.paidCents,
    varianceCents: p.varianceCents, status: p.status,
  };
}

function buildSpendMatching(dataset: Awaited<ReturnType<typeof assembleTruthDataset>>) {
  const byMonth = new Map<string, { platform: string; tracked: number; paid: number }[]>();
  const grouped = new Map<string, { tracked: number; paid: number }>();
  for (const row of dataset.spend) {
    const key = `${row.date.slice(0, 7)}|${row.platform}`;
    const g = grouped.get(key) ?? { tracked: 0, paid: 0 };
    g.tracked += row.spendCents;
    if (row.paidStatus === "paid_verified") g.paid += row.spendCents;
    grouped.set(key, g);
  }
  for (const [key, g] of grouped) {
    const [month, platform] = key.split("|");
    const list = byMonth.get(month) ?? [];
    list.push({ platform, tracked: g.tracked, paid: g.paid });
    byMonth.set(month, list);
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, platforms]) => ({ month, platforms }));
}
