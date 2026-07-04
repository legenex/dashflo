import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { assembleTruthDataset } from "@/server/truth-data";
import { resolveRange } from "@/lib/date-range";
import { AdPerformanceClient } from "./AdPerformanceClient";

export const dynamic = "force-dynamic";

export default async function AdPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const range = resolveRange({ range: params.range ?? "60d", from: params.from, to: params.to });
  const dataset = await assembleTruthDataset(ctx.organizationId);

  const [spendRows, accounts] = await Promise.all([
    ctx.db.query.adSpendRecords.findMany({ where: eq(schema.adSpendRecords.organizationId, ctx.organizationId) }),
    ctx.db.query.adAccounts.findMany({ where: eq(schema.adAccounts.organizationId, ctx.organizationId) }),
  ]);
  const platformOf = new Map(accounts.map((a) => [a.id, a.platform]));

  const inRange = (d: string) => d >= range.from && d <= range.to;
  const leadsInRange = dataset.leads.filter((l) => !l.isTest && inRange(l.receivedAt));
  const leadsByAd = new Map<string, { leads: number; sold: number; booked: number; verified: number }>();
  const rawLeads = await ctx.db.query.leads.findMany({ where: eq(schema.leads.organizationId, ctx.organizationId) });
  for (const l of rawLeads) {
    if (l.isTest) continue;
    const dateKey = l.receivedAt.toISOString().slice(0, 10);
    if (!inRange(dateKey)) continue;
    const adId = l.adMeta?.ad_id;
    if (!adId) continue;
    const bucket = leadsByAd.get(adId) ?? { leads: 0, sold: 0, booked: 0, verified: 0 };
    bucket.leads++;
    if (l.status === "sold") {
      bucket.sold++;
      bucket.booked += l.salePriceCents ?? 0;
      bucket.verified += l.paidAllocatedCents;
    }
    leadsByAd.set(adId, bucket);
  }

  interface Agg {
    key: string; name: string; sub: string; brand: string | null; platform: string;
    spend: number; paid: number; impressions: number; clicks: number;
    leads: number; sold: number; booked: number; verified: number;
  }
  const build = (keyFn: (r: typeof spendRows[number]) => [string, string, string]): Agg[] => {
    const map = new Map<string, Agg>();
    for (const r of spendRows) {
      if (!inRange(r.date)) continue;
      const [key, name, sub] = keyFn(r);
      let g = map.get(key);
      if (!g) {
        g = {
          key, name, sub, brand: r.mappedBrand, platform: platformOf.get(r.adAccountId) ?? "meta",
          spend: 0, paid: 0, impressions: 0, clicks: 0, leads: 0, sold: 0, booked: 0, verified: 0,
        };
        map.set(key, g);
      }
      g.spend += r.spendCents;
      if (r.paidStatus === "paid_verified") g.paid += r.spendCents;
      g.impressions += r.impressions;
      g.clicks += r.clicks;
    }
    // attribute leads at ad grain then roll up by matching key prefix
    return [...map.values()];
  };

  const adAgg = build((r) => [r.adExtId, r.adName, `${r.campaignName} · ${r.adsetName}`]);
  for (const g of adAgg) {
    const stats = leadsByAd.get(g.key);
    if (stats) {
      g.leads = stats.leads; g.sold = stats.sold; g.booked = stats.booked; g.verified = stats.verified;
    }
  }
  const rollup = (grain: "campaign" | "adset" | "platform"): Agg[] => {
    const map = new Map<string, Agg>();
    for (const r of spendRows) {
      if (!inRange(r.date)) continue;
      const key = grain === "campaign" ? r.campaignName : grain === "adset" ? `${r.campaignName}|${r.adsetName}` : platformOf.get(r.adAccountId) ?? "meta";
      const name = grain === "adset" ? r.adsetName : key;
      let g = map.get(key);
      if (!g) {
        g = { key, name, sub: grain === "adset" ? r.campaignName : grain === "campaign" ? (r.mappedBrand ?? "unmapped") : "", brand: r.mappedBrand, platform: platformOf.get(r.adAccountId) ?? "meta", spend: 0, paid: 0, impressions: 0, clicks: 0, leads: 0, sold: 0, booked: 0, verified: 0 };
        map.set(key, g);
      }
      g.spend += r.spendCents;
      if (r.paidStatus === "paid_verified") g.paid += r.spendCents;
      g.impressions += r.impressions;
      g.clicks += r.clicks;
    }
    // roll lead stats from ads into parents
    for (const ad of adAgg) {
      const spendRow = spendRows.find((r) => r.adExtId === ad.key);
      if (!spendRow) continue;
      const key = grain === "campaign" ? spendRow.campaignName : grain === "adset" ? `${spendRow.campaignName}|${spendRow.adsetName}` : platformOf.get(spendRow.adAccountId) ?? "meta";
      const g = map.get(key);
      if (g) {
        g.leads += ad.leads; g.sold += ad.sold; g.booked += ad.booked; g.verified += ad.verified;
      }
    }
    return [...map.values()];
  };

  // Funnel totals.
  const funnel = {
    spend: adAgg.reduce((s, g) => s + g.spend, 0),
    impressions: adAgg.reduce((s, g) => s + g.impressions, 0),
    clicks: adAgg.reduce((s, g) => s + g.clicks, 0),
    leads: leadsInRange.length,
    sold: leadsInRange.filter((l) => l.status === "sold" || l.status === "returned").length,
    booked: leadsInRange.filter((l) => l.status === "sold").reduce((s, l) => s + (l.salePriceCents ?? 0), 0),
    verified: leadsInRange.reduce((s, l) => s + l.paidAllocatedCents, 0),
  };

  // Heatmaps: volume and sold rate by day-of-week x hour.
  const volume: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const soldMatrix: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const l of rawLeads) {
    if (l.isTest) continue;
    const dateKey = l.receivedAt.toISOString().slice(0, 10);
    if (!inRange(dateKey)) continue;
    const day = l.receivedAt.getUTCDay();
    const hour = l.receivedAt.getUTCHours();
    volume[day][hour]++;
    if (l.status === "sold" || l.status === "returned") soldMatrix[day][hour]++;
  }

  const serialize = (g: Agg) => ({
    ...g,
    roas: g.spend > 0 ? Number((g.booked / g.spend).toFixed(2)) : null,
    cashRoas: g.spend > 0 ? Number((g.verified / g.spend).toFixed(2)) : null,
  });

  return (
    <AdPerformanceClient
      rangeLabel={range.label}
      funnel={funnel}
      byPlatform={rollup("platform").map(serialize)}
      byCampaign={rollup("campaign").map(serialize)}
      byAdset={rollup("adset").map(serialize)}
      byAd={adAgg.map(serialize)}
      heatVolume={volume}
      heatSold={soldMatrix}
    />
  );
}
