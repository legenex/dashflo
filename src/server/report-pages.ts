import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { assembleTruthDataset } from "@/server/truth-data";
import {
  computeAggregates,
  computeMetricValue,
  filterLeads,
  metricDef,
  type FilterContext,
} from "@/domain/reports/metrics";
import type {
  ReportFieldFilter,
  ReportPageConfig,
  ReportPageKind,
  ReportWidget,
} from "@/db/schema";
import type { TruthLead } from "@/domain/truth/types";

// Report page defaults, and the resolver that turns a page config plus
// runtime filters into card values and widget rows.

export const MONEY_CARDS = ["revenue", "net_revenue", "cost", "cpl", "profit", "net_profit"];
export const VOLUME_CARDS = ["total_leads", "sold_leads", "fake_leads", "returns", "duplicates", "gp_margin", "conversions", "conv_rate"];

const STATE_TABLE: ReportWidget = {
  id: "w_state", type: "state_table", title: "State Performance",
  metrics: ["total_leads", "sold_leads", "conv_rate", "net_revenue", "cpl", "profit"],
};
const DAILY_TABLE: ReportWidget = {
  id: "w_daily", type: "daily_table", title: "Daily Performance",
  metrics: ["total_leads", "sold_leads", "conv_rate", "net_revenue", "cost", "profit", "net_profit"],
};

export function defaultPages(): Array<{
  name: string; slug: string; kind: ReportPageKind; description: string;
  entityType?: "buyer" | "supplier" | "campaign"; entityId?: string;
  portalVisible?: boolean; sortOrder: number; config: ReportPageConfig;
}> {
  return [
    {
      name: "Performance Overview", slug: "performance-overview", kind: "overview", sortOrder: 1,
      description: "The whole business at a glance: money cards, volume cards, truth chart, and state performance.",
      config: {
        cards: [...MONEY_CARDS, ...VOLUME_CARDS],
        widgets: [
          { id: "w_chart", type: "truth_chart", title: "Booked vs Verified vs Spend" },
          STATE_TABLE,
          { id: "w_camp", type: "campaign_table", title: "Campaign Performance", metrics: ["total_leads", "sold_leads", "conv_rate", "net_revenue", "cost", "profit", "net_profit"] },
        ],
        filters: [], customMetrics: [],
      },
    },
    {
      name: "Daily Performance", slug: "daily-performance", kind: "daily", sortOrder: 2,
      description: "Day by day: volume, revenue, cost, and profit with cash truth.",
      config: {
        cards: [...MONEY_CARDS, "total_leads", "sold_leads", "conv_rate"],
        widgets: [DAILY_TABLE, { id: "w_chart", type: "truth_chart", title: "Booked vs Verified" }],
        filters: [], customMetrics: [],
      },
    },
    {
      name: "Buyer Performance", slug: "buyer-performance", kind: "buyer", sortOrder: 3,
      description: "Every buyer side by side. Clone this per buyer to publish a portal page.",
      config: {
        cards: [...MONEY_CARDS, "total_leads", "sold_leads", "returns", "conv_rate"],
        widgets: [
          { id: "w_buyer", type: "buyer_table", title: "Buyer Performance", metrics: ["total_leads", "sold_leads", "conv_rate", "net_revenue", "verified_income", "revenue_gap", "returns"] },
          STATE_TABLE, DAILY_TABLE,
        ],
        filters: [], customMetrics: [],
      },
    },
    {
      name: "Supplier Performance", slug: "supplier-performance", kind: "supplier", sortOrder: 4,
      description: "Every supplier side by side. Clone per supplier to publish a portal page.",
      config: {
        cards: ["total_leads", "sold_leads", "conv_rate", "fake_leads", "duplicates", "cost", "cpl", "profit"],
        widgets: [
          { id: "w_sup", type: "supplier_table", title: "Supplier Performance", metrics: ["total_leads", "sold_leads", "conv_rate", "fake_leads", "duplicates", "dup_rate", "cost", "cpl"] },
          STATE_TABLE, DAILY_TABLE,
        ],
        filters: [], customMetrics: [],
      },
    },
    {
      name: "Campaign Performance", slug: "campaign-performance", kind: "campaign", sortOrder: 5,
      description: "Campaign economics with media cost attributed through mapping rules.",
      config: {
        cards: [...MONEY_CARDS, "total_leads", "sold_leads", "conv_rate", "gp_margin"],
        widgets: [
          { id: "w_camp", type: "campaign_table", title: "Campaign Performance", metrics: ["total_leads", "sold_leads", "conv_rate", "net_revenue", "cost", "cpl", "profit", "net_profit"] },
          { id: "w_chart", type: "truth_chart", title: "Booked vs Verified vs Spend" },
        ],
        filters: [], customMetrics: [],
      },
    },
    {
      name: "Lead Quality", slug: "lead-quality", kind: "quality", sortOrder: 6,
      description: "Fakes, duplicates, returns, and errors by source. Pay for volume that converts.",
      config: {
        cards: ["total_leads", "fake_leads", "duplicates", "dup_rate", "returns", "return_rate", "errors", "conv_rate"],
        widgets: [
          { id: "w_sup", type: "supplier_table", title: "Quality by Supplier", metrics: ["total_leads", "sold_leads", "fake_leads", "duplicates", "dup_rate", "errors", "return_rate"] },
          { id: "w_camp", type: "campaign_table", title: "Quality by Campaign", metrics: ["total_leads", "sold_leads", "fake_leads", "duplicates", "dup_rate", "returns"] },
          STATE_TABLE,
        ],
        filters: [
          { id: "f_recent", label: "Accident within 7 days", field: "incident_date", operator: "within_days", value: 7, enabled: false },
        ],
        customMetrics: [],
      },
    },
  ];
}

export function entityPageTemplate(
  entityType: "buyer" | "supplier",
  entityId: string,
  entityName: string
): { name: string; slug: string; kind: ReportPageKind; description: string; config: ReportPageConfig } {
  const slugBase = entityName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (entityType === "buyer") {
    return {
      name: `${entityName} Performance`, slug: `buyer-${slugBase}`, kind: "buyer",
      description: `Portal report for ${entityName}: their leads, conversion, and state performance.`,
      config: {
        cards: ["total_leads", "sold_leads", "conv_rate", "returns", "net_revenue", "avg_price"],
        widgets: [STATE_TABLE, DAILY_TABLE],
        filters: [], customMetrics: [],
      },
    };
  }
  return {
    name: `${entityName} Performance`, slug: `supplier-${slugBase}`, kind: "supplier",
    description: `Portal report for ${entityName}: volume, quality, and state performance.`,
    config: {
      cards: ["total_leads", "sold_leads", "conv_rate", "fake_leads", "duplicates", "dup_rate"],
      widgets: [STATE_TABLE, DAILY_TABLE],
      filters: [], customMetrics: [],
    },
  };
}

export async function seedDefaultReportPages(organizationId: string): Promise<number> {
  const db = await getDb();
  const existing = await db.query.reportPages.findMany({
    where: eq(schema.reportPages.organizationId, organizationId),
  });
  const existingSlugs = new Set(existing.map((p) => p.slug));
  let created = 0;
  for (const page of defaultPages()) {
    if (existingSlugs.has(page.slug)) continue;
    await db.insert(schema.reportPages).values({
      id: newId("rpg"), organizationId,
      name: page.name, slug: page.slug, kind: page.kind, description: page.description,
      entityType: page.entityType ?? null, entityId: page.entityId ?? null,
      config: page.config, portalVisible: false, isDefault: true, sortOrder: page.sortOrder,
      createdAt: new Date(),
    });
    created++;
  }
  return created;
}

// ---- Data resolver ----

export interface CardValue {
  id: string;
  label: string;
  format: "money" | "number" | "pct";
  value: number | null;
  verified?: number | null; // verified twin for revenue-flavored cards
}

export interface WidgetData {
  id: string;
  type: ReportWidget["type"];
  title: string;
  columns: Array<{ id: string; label: string; format: "money" | "number" | "pct" }>;
  rows: Array<{ key: string; label: string; values: Array<number | null> }>;
  chart?: Array<{ date: string; booked: number; verified: number | null; spend: number | null }>;
}

export interface ReportPageData {
  cards: CardValue[];
  widgets: WidgetData[];
  availableFields: Array<{ key: string; label: string }>;
}

export async function resolveReportPage(args: {
  organizationId: string;
  config: ReportPageConfig;
  entityType?: "buyer" | "supplier" | "campaign" | null;
  entityId?: string | null;
  from?: string;
  to?: string;
  runtimeFilters?: ReportFieldFilter[]; // overrides page filters (enabled state / values)
  extra?: { campaignIds?: string[]; buyerIds?: string[]; supplierIds?: string[]; states?: string[] };
}): Promise<ReportPageData> {
  const db = await getDb();
  const dataset = await assembleTruthDataset(args.organizationId);
  const rawLeads = await db.query.leads.findMany({
    where: eq(schema.leads.organizationId, args.organizationId),
    columns: { id: true, fieldData: true },
  });
  const fieldDataById = new Map(rawLeads.map((l) => [l.id, l.fieldData]));

  const filters = args.runtimeFilters ?? args.config.filters;
  const entityFilter: Partial<FilterContext> = {};
  if (args.entityType === "buyer" && args.entityId) entityFilter.buyerIds = [args.entityId];
  if (args.entityType === "supplier" && args.entityId) entityFilter.supplierIds = [args.entityId];
  if (args.entityType === "campaign" && args.entityId) entityFilter.campaignIds = [args.entityId];

  const includeMedia = !args.entityType || args.entityType === "campaign";
  const ctx: FilterContext = {
    from: args.from,
    to: args.to,
    fieldFilters: filters,
    today: dataset.today,
    includeMedia,
    campaignIds: args.extra?.campaignIds ?? entityFilter.campaignIds,
    buyerIds: args.extra?.buyerIds ?? entityFilter.buyerIds,
    supplierIds: args.extra?.supplierIds ?? entityFilter.supplierIds,
    states: args.extra?.states,
  };

  const leads = filterLeads(dataset, fieldDataById, ctx);
  const aggregates = computeAggregates(leads, dataset, ctx);
  const custom = args.config.customMetrics ?? [];

  const cards: CardValue[] = args.config.cards
    .map((id) => {
      const def = metricDef(id, custom);
      if (!def) return null;
      const card: CardValue = { id, label: def.label, format: def.format, value: computeMetricValue(id, aggregates, custom) };
      if (id === "revenue" || id === "net_revenue") card.verified = aggregates.verifiedCents;
      if (id === "profit") {
        card.verified =
          aggregates.verifiedCents === null || aggregates.supplierPaidCents === null
            ? null
            : aggregates.verifiedCents - aggregates.supplierPaidCents - (aggregates.mediaCostCents ?? 0) - aggregates.otherCostCents;
      }
      return card;
    })
    .filter((c): c is CardValue => c !== null);

  const nameOf = {
    buyer: new Map(dataset.buyers.map((b) => [b.id, b.name])),
    supplier: new Map(dataset.suppliers.map((s) => [s.id, s.name])),
    campaign: new Map(dataset.campaigns.map((c) => [c.id, c.name])),
  };

  const widgets: WidgetData[] = [];
  for (const w of args.config.widgets) {
    if (w.type === "truth_chart") {
      const byDay = new Map<string, { booked: number; verified: number; spend: number }>();
      for (const l of leads) {
        if (l.status !== "sold" && l.status !== "returned") continue;
        const d = byDay.get(l.receivedAt) ?? { booked: 0, verified: 0, spend: 0 };
        if (l.status === "sold") {
          d.booked += l.salePriceCents ?? 0;
          d.verified += l.paidAllocatedCents;
        }
        byDay.set(l.receivedAt, d);
      }
      if (includeMedia) {
        for (const s of dataset.spend) {
          if (args.from && s.date < args.from) continue;
          if (args.to && s.date > args.to) continue;
          if (ctx.campaignIds?.length && (s.mappedCampaignId === null || !ctx.campaignIds.includes(s.mappedCampaignId))) continue;
          const d = byDay.get(s.date) ?? { booked: 0, verified: 0, spend: 0 };
          d.spend += s.spendCents;
          byDay.set(s.date, d);
        }
      }
      widgets.push({
        id: w.id, type: w.type, title: w.title ?? "Booked vs Verified", columns: [], rows: [],
        chart: [...byDay.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, d]) => ({
            date: date.slice(5),
            booked: Math.round(d.booked / 100),
            verified: dataset.connectors["stripe"] === "active" || dataset.connectors["mercury"] === "active" ? Math.round(d.verified / 100) : null,
            spend: includeMedia ? Math.round(d.spend / 100) : null,
          })),
      });
      continue;
    }

    const metricIds = (w.metrics ?? ["total_leads", "sold_leads", "conv_rate", "net_revenue"]).filter((m) => metricDef(m, custom));
    const columns = metricIds.map((m) => {
      const def = metricDef(m, custom)!;
      return { id: m, label: def.label, format: def.format };
    });

    const keyFn = (l: TruthLead): [string, string] | null => {
      switch (w.type) {
        case "state_table": return l.state ? [l.state, l.state] : null;
        case "daily_table": return [l.receivedAt, l.receivedAt];
        case "buyer_table": return l.buyerId ? [l.buyerId, nameOf.buyer.get(l.buyerId) ?? l.buyerId] : null;
        case "supplier_table": return [l.supplierId, nameOf.supplier.get(l.supplierId) ?? l.supplierId];
        case "campaign_table": return [l.campaignId, nameOf.campaign.get(l.campaignId) ?? l.campaignId];
        default: return null;
      }
    };

    const groups = new Map<string, { label: string; leads: TruthLead[] }>();
    for (const l of leads) {
      const key = keyFn(l);
      if (!key) continue;
      const g = groups.get(key[0]) ?? { label: key[1], leads: [] };
      g.leads.push(l);
      groups.set(key[0], g);
    }

    const rows = [...groups.entries()]
      .map(([key, g]) => {
        const groupCtx: FilterContext = {
          ...ctx,
          includeMedia: w.type === "campaign_table" || w.type === "daily_table" ? includeMedia : false,
          campaignIds: w.type === "campaign_table" ? [key] : ctx.campaignIds,
          from: w.type === "daily_table" ? key : ctx.from,
          to: w.type === "daily_table" ? key : ctx.to,
        };
        const agg = computeAggregates(g.leads, dataset, groupCtx);
        return {
          key,
          label: g.label,
          values: metricIds.map((m) => computeMetricValue(m, agg, custom)),
        };
      })
      .sort((a, b) => {
        if (w.type === "daily_table") return a.key < b.key ? 1 : -1;
        return (b.values[0] ?? 0) - (a.values[0] ?? 0);
      })
      .slice(0, w.limit ?? 60);

    widgets.push({ id: w.id, type: w.type, title: w.title ?? w.type.replace(/_/g, " "), columns, rows });
  }

  // Fields available for the filter builder: union of campaign field mappings.
  const campaigns = await db.query.campaigns.findMany({
    where: eq(schema.campaigns.organizationId, args.organizationId),
  });
  const fieldSet = new Map<string, string>();
  fieldSet.set("state", "State");
  for (const c of campaigns) for (const f of c.fieldMapping) fieldSet.set(f.key, f.label);

  return {
    cards,
    widgets,
    availableFields: [...fieldSet.entries()].map(([key, label]) => ({ key, label })),
  };
}
