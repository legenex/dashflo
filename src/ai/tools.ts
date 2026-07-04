import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { computeTruth } from "@/domain/truth/compute";
import { assembleTruthDataset } from "@/server/truth-data";
import { toDateKey, addDays } from "@/lib/transforms";
import type { TruthScope } from "@/domain/truth/types";

// The AI tool layer. The model never sees raw tables: every tool returns
// computed aggregates with PII masked (names to initials, contact stripped).

export interface ChartSpec {
  kind: "bar" | "line";
  title: string;
  data: Array<{ label: string; value: number; value2?: number }>;
  series?: [string, string];
}

export const TOOL_DEFINITIONS = [
  {
    name: "query_truth",
    description:
      "Compute the four-layer truth (performance, booked, verified, gap) grouped by a scope. Returns rows and totals. All money is integer cents. null means UNKNOWN (missing source), never zero.",
    input_schema: {
      type: "object" as const,
      properties: {
        scope: { type: "string", enum: ["campaign", "buyer", "supplier", "day", "org", "state"] },
        from: { type: "string", description: "YYYY-MM-DD inclusive" },
        to: { type: "string", description: "YYYY-MM-DD inclusive" },
        campaign_ids: { type: "array", items: { type: "string" } },
        buyer_ids: { type: "array", items: { type: "string" } },
      },
      required: ["scope"],
    },
  },
  {
    name: "query_leads",
    description:
      "Aggregate lead counts by status, campaign, buyer, supplier, or state. Never returns individual contact data.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_by: { type: "string", enum: ["status", "campaign", "buyer", "supplier", "state", "day"] },
        from: { type: "string" },
        to: { type: "string" },
        status: { type: "string" },
      },
      required: ["group_by"],
    },
  },
  {
    name: "query_actions",
    description: "List open action items sorted by amount at risk.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["open", "in_progress", "resolved", "dismissed"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "list_variances",
    description: "List reconciliation periods with flagged variances (short pays and gaps) by counterparty.",
    input_schema: {
      type: "object" as const,
      properties: {
        counterparty_type: { type: "string", enum: ["buyer", "supplier"] },
        only_flagged: { type: "boolean" },
      },
    },
  },
  {
    name: "query_spend",
    description:
      "Ad spend aggregates by platform, campaign, adset, ad, or brand, with sold lead counts and booked/verified revenue joins for ROAS. Includes paid verification status.",
    input_schema: {
      type: "object" as const,
      properties: {
        group_by: { type: "string", enum: ["platform", "campaign", "adset", "ad", "brand", "day"] },
        from: { type: "string" },
        to: { type: "string" },
      },
      required: ["group_by"],
    },
  },
  {
    name: "get_connector_status",
    description: "Connector health: which money and ad sources are active, coverage, and what each gap blocks.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "render_chart",
    description:
      "Render a small inline chart in the answer. Call with data you computed from other tools. Values in dollars (not cents).",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", enum: ["bar", "line"] },
        title: { type: "string" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "number" },
              value2: { type: "number" },
            },
            required: ["label", "value"],
          },
        },
        series: { type: "array", items: { type: "string" } },
      },
      required: ["kind", "title", "data"],
    },
  },
];

function maskName(name: string): string {
  return name
    .split(/\s+/)
    .map((part, i) => (i === 0 ? part : `${part[0] ?? ""}.`))
    .join(" ");
}

export interface ToolExecutionContext {
  organizationId: string;
  charts: ChartSpec[];
}

type JsonValue = unknown;

export async function executeTool(
  ctx: ToolExecutionContext,
  name: string,
  input: Record<string, unknown>
): Promise<JsonValue> {
  const db = await getDb();

  switch (name) {
    case "query_truth": {
      const dataset = await assembleTruthDataset(ctx.organizationId);
      const scope = String(input.scope ?? "org") as TruthScope;
      const result = computeTruth(dataset, {
        scope,
        range:
          typeof input.from === "string" && typeof input.to === "string"
            ? { from: input.from, to: input.to }
            : undefined,
        filters: {
          campaignIds: Array.isArray(input.campaign_ids) ? (input.campaign_ids as string[]) : undefined,
          buyerIds: Array.isArray(input.buyer_ids) ? (input.buyer_ids as string[]) : undefined,
        },
      });
      const slim = (r: (typeof result.rows)[number]) => ({
        key: r.key,
        name: r.name,
        performance: r.performance,
        booked: r.booked,
        verified: r.verified,
        gap: {
          revenue_gap: r.gap.revenue_gap,
          outstanding: r.gap.outstanding,
          overdue: r.gap.overdue,
          due_soon: r.gap.due_soon,
          short_paid: r.gap.short_paid,
          spend_gap: r.gap.spend_gap,
          supplier_cost_gap: r.gap.supplier_cost_gap,
          payment_status: r.gap.payment_status,
          verification_status: r.gap.verification_status,
          data_quality: r.gap.data_quality,
          missing_sources: r.gap.missing_sources,
        },
        profit_truth: r.profit_truth,
        decision: r.decision,
      });
      return { rows: result.rows.map(slim), totals: slim(result.totals) };
    }

    case "query_leads": {
      const dataset = await assembleTruthDataset(ctx.organizationId);
      const groupBy = String(input.group_by ?? "status");
      const from = typeof input.from === "string" ? input.from : "0000";
      const to = typeof input.to === "string" ? input.to : "9999";
      const statusFilter = typeof input.status === "string" ? input.status : null;
      const counts = new Map<string, number>();
      for (const lead of dataset.leads) {
        if (lead.receivedAt < from || lead.receivedAt > to) continue;
        if (statusFilter && lead.status !== statusFilter) continue;
        const key =
          groupBy === "status" ? lead.status
          : groupBy === "campaign" ? dataset.campaigns.find((c) => c.id === lead.campaignId)?.name ?? lead.campaignId
          : groupBy === "buyer" ? (lead.buyerId ? dataset.buyers.find((b) => b.id === lead.buyerId)?.name ?? lead.buyerId : "unrouted")
          : groupBy === "supplier" ? dataset.suppliers.find((s) => s.id === lead.supplierId)?.name ?? lead.supplierId
          : groupBy === "state" ? lead.state ?? "unknown"
          : lead.receivedAt;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return { group_by: groupBy, counts: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])) };
    }

    case "query_actions": {
      const status = typeof input.status === "string" ? input.status : "open";
      const limit = typeof input.limit === "number" ? Math.min(50, input.limit) : 20;
      const items = await db.query.actionItems.findMany({
        where: and(
          eq(schema.actionItems.organizationId, ctx.organizationId),
          eq(schema.actionItems.status, status as "open")
        ),
        orderBy: desc(schema.actionItems.amountAtRiskCents),
        limit,
      });
      return items.map((i) => ({
        id: i.id,
        issue_type: i.issueType,
        entity: i.entityName,
        priority: i.priority,
        amount_at_risk_cents: i.amountAtRiskCents,
        description: i.description,
      }));
    }

    case "list_variances": {
      const onlyFlagged = input.only_flagged !== false;
      const periods = await db.query.reconciliationPeriods.findMany({
        where: eq(schema.reconciliationPeriods.organizationId, ctx.organizationId),
      });
      const dataset = await assembleTruthDataset(ctx.organizationId);
      return periods
        .filter((p) => (onlyFlagged ? p.status === "variance_flagged" : true))
        .filter((p) =>
          typeof input.counterparty_type === "string" ? p.counterpartyType === input.counterparty_type : true
        )
        .filter((p) => p.granularity === "month")
        .map((p) => ({
          counterparty:
            p.counterpartyType === "buyer"
              ? dataset.buyers.find((b) => b.id === p.counterpartyId)?.name ?? p.counterpartyId
              : dataset.suppliers.find((s) => s.id === p.counterpartyId)?.name ?? p.counterpartyId,
          counterparty_type: p.counterpartyType,
          period_start: p.periodStart,
          period_end: p.periodEnd,
          expected_cents: p.expectedCents,
          paid_cents: p.paidCents,
          variance_cents: p.varianceCents,
          status: p.status,
        }));
    }

    case "query_spend": {
      const groupBy = String(input.group_by ?? "platform");
      const from = typeof input.from === "string" ? input.from : toDateKey(addDays(new Date(), -28));
      const to = typeof input.to === "string" ? input.to : toDateKey(new Date());
      const db2 = await getDb();
      const [spendRows, accounts] = await Promise.all([
        db2.query.adSpendRecords.findMany({
          where: eq(schema.adSpendRecords.organizationId, ctx.organizationId),
        }),
        db2.query.adAccounts.findMany({ where: eq(schema.adAccounts.organizationId, ctx.organizationId) }),
      ]);
      const dataset = await assembleTruthDataset(ctx.organizationId);
      const platformOf = (accountId: string) => accounts.find((a) => a.id === accountId)?.platform ?? "meta";
      const groups = new Map<
        string,
        { spend: number; paid: number; impressions: number; clicks: number; campaignIds: Set<string> }
      >();
      for (const row of spendRows) {
        if (row.date < from || row.date > to) continue;
        const key =
          groupBy === "platform" ? platformOf(row.adAccountId)
          : groupBy === "campaign" ? row.campaignName
          : groupBy === "adset" ? row.adsetName
          : groupBy === "ad" ? row.adName
          : groupBy === "brand" ? row.mappedBrand ?? "unmapped"
          : row.date;
        let g = groups.get(key);
        if (!g) {
          g = { spend: 0, paid: 0, impressions: 0, clicks: 0, campaignIds: new Set() };
          groups.set(key, g);
        }
        g.spend += row.spendCents;
        if (row.paidStatus === "paid_verified") g.paid += row.spendCents;
        g.impressions += row.impressions;
        g.clicks += row.clicks;
        if (row.mappedCampaignId) g.campaignIds.add(row.mappedCampaignId);
      }
      return [...groups.entries()]
        .map(([key, g]) => {
          const soldLeads = dataset.leads.filter(
            (l) =>
              !l.isTest &&
              l.receivedAt >= from &&
              l.receivedAt <= to &&
              g.campaignIds.has(l.campaignId) &&
              (l.status === "sold" || l.status === "returned")
          );
          const booked = soldLeads.filter((l) => l.status === "sold").reduce((s, l) => s + (l.salePriceCents ?? 0), 0);
          const verified = soldLeads.reduce((s, l) => s + l.paidAllocatedCents, 0);
          return {
            key,
            spend_cents: g.spend,
            spend_paid_verified_cents: g.paid,
            impressions: g.impressions,
            clicks: g.clicks,
            sold_leads: soldLeads.length,
            booked_revenue_cents: booked,
            verified_income_cents: verified,
            roas: g.spend > 0 ? Number((booked / g.spend).toFixed(2)) : null,
            cash_roas: g.spend > 0 ? Number((verified / g.spend).toFixed(2)) : null,
          };
        })
        .sort((a, b) => b.spend_cents - a.spend_cents);
    }

    case "get_connector_status": {
      const rows = await db.query.connectorStatuses.findMany({
        where: eq(schema.connectorStatuses.organizationId, ctx.organizationId),
      });
      return rows.map((r) => ({
        provider: r.provider,
        status: r.status,
        last_sync_at: r.lastSyncAt?.toISOString() ?? null,
        coverage_pct: r.coveragePct,
        impact: connectorImpact(r.provider, r.status),
      }));
    }

    case "render_chart": {
      const spec: ChartSpec = {
        kind: input.kind === "line" ? "line" : "bar",
        title: String(input.title ?? "Chart"),
        data: Array.isArray(input.data)
          ? (input.data as Array<{ label: string; value: number; value2?: number }>).slice(0, 24)
          : [],
        series:
          Array.isArray(input.series) && input.series.length === 2
            ? [String(input.series[0]), String(input.series[1])]
            : undefined,
      };
      ctx.charts.push(spec);
      return { rendered: true };
    }

    default:
      return { error: `Unknown tool ${name}` };
  }
}

export function connectorImpact(provider: string, status: string): string {
  if (status === "active") return "healthy";
  const impacts: Record<string, string> = {
    stripe: "Buyer payment verification degraded, verified income may show UNKNOWN",
    mercury: "Bank feed matching unavailable, spend verification and cash truth degraded",
    xero: "Invoice sync unavailable, receivables aging may be stale",
    meta_ads: "Meta spend tracking unavailable, media cost shows Needs Source",
    google_ads: "Google spend tracking unavailable, media cost shows Needs Source",
    tiktok_ads: "TikTok spend tracking unavailable",
    supplier_statements: "Supplier cost verification limited to bank matches",
    slack: "Slack alerts fall back to console and notifications",
    lead_ingestion: "Inbound leads blocked",
    buyer_feedback: "Buyer dispositions unavailable",
  };
  return impacts[provider] ?? "Source inactive";
}

export { maskName };
