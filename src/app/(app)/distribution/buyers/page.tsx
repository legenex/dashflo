import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { riskScore } from "@/domain/decisions/classify";
import { BuyersClient } from "./BuyersClient";

export const dynamic = "force-dynamic";

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const dataset = await assembleTruthDataset(ctx.organizationId);
  const truth = computeTruth(dataset, { scope: "buyer" });

  const buyers = await ctx.db.query.buyers.findMany({
    where: eq(schema.buyers.organizationId, ctx.organizationId),
  });

  // Partner role sees only their scoped buyer.
  const visible = ctx.role === "partner" && ctx.partnerScope?.buyer_id
    ? buyers.filter((b) => b.id === ctx.partnerScope?.buyer_id)
    : buyers;

  const rows = visible.map((b) => {
    const t = truth.rows.find((r) => r.key === b.id);
    const lastPaymentDate = dataset.leads
      .filter((l) => l.buyerId === b.id && l.paidAllocatedCents > 0)
      .map((l) => l.soldAt)
      .sort()
      .pop() ?? null;
    const spark = (() => {
      const byDay = new Map<string, number>();
      for (const lead of dataset.leads) {
        if (lead.buyerId !== b.id || lead.isTest || (lead.status !== "sold" && lead.status !== "returned")) continue;
        byDay.set(lead.receivedAt, (byDay.get(lead.receivedAt) ?? 0) + 1);
      }
      return [...byDay.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).slice(-14).map(([, v]) => v);
    })();
    return {
      id: b.id,
      name: b.name,
      status: b.status,
      termsDays: b.paymentTermsDays,
      priceDefaultCents: b.priceDefaultCents,
      caps: b.caps,
      deliveryConfig: b.deliveryConfig,
      notes: b.notes,
      spark,
      lastPaymentDate,
      truth: t
        ? {
            leads: t.performance.leads,
            sold: t.performance.sold,
            soldRate: t.performance.sold_rate,
            acceptRate: t.performance.accept_rate,
            booked: t.booked.booked_revenue,
            verified: t.verified.verified_income,
            outstanding: t.gap.outstanding,
            dueSoon: t.gap.due_soon,
            overdue: t.gap.overdue,
            shortPaid: t.gap.short_paid,
            gap: t.gap.revenue_gap,
            paymentStatus: t.gap.payment_status,
            profitTruth: t.profit_truth,
            risk: riskScore({
              bookedRevenue: t.booked.booked_revenue,
              overdue: t.gap.overdue ?? 0,
              shortPaid: t.gap.short_paid ?? 0,
              hasPaymentSource: t.gap.payment_status !== "no_payment_source",
            }),
          }
        : null,
    };
  });

  return <BuyersClient rows={rows} openId={params.open ?? null} canManage={["owner", "admin"].includes(ctx.role)} />;
}
