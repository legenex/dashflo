import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { resolveRange } from "@/lib/date-range";
import { CampaignsClient } from "./CampaignsClient";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const range = resolveRange(params);
  const dataset = await assembleTruthDataset(ctx.organizationId);
  const truth = computeTruth(dataset, { scope: "campaign", range: { from: range.from, to: range.to } });

  const campaigns = await ctx.db.query.campaigns.findMany({
    where: eq(schema.campaigns.organizationId, ctx.organizationId),
  });

  // Sold-rate sparkline per campaign (last 14 days).
  const sparkFor = (campaignId: string): number[] => {
    const byDay = new Map<string, { leads: number; sold: number }>();
    for (const lead of dataset.leads) {
      if (lead.campaignId !== campaignId || lead.isTest) continue;
      const bucket = byDay.get(lead.receivedAt) ?? { leads: 0, sold: 0 };
      bucket.leads++;
      if (lead.status === "sold" || lead.status === "returned") bucket.sold++;
      byDay.set(lead.receivedAt, bucket);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-14)
      .map(([, v]) => (v.leads > 0 ? v.sold / v.leads : 0));
  };

  const rows = campaigns.map((c) => {
    const t = truth.rows.find((r) => r.key === c.id);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      vertical: c.vertical,
      type: c.type,
      status: c.status,
      spark: sparkFor(c.id),
      truth: t
        ? {
            leads: t.performance.leads,
            soldRate: t.performance.sold_rate,
            booked: t.booked.booked_revenue,
            verified: t.verified.verified_income,
            gap: t.gap.revenue_gap,
            profitTruth: t.profit_truth,
            decision: t.decision,
            missingSources: t.gap.missing_sources,
          }
        : null,
    };
  });

  return <CampaignsClient rows={rows} />;
}
