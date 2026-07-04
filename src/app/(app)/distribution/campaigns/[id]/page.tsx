import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { CampaignDetailClient } from "./CampaignDetailClient";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "new") notFound();
  const ctx = await requireOrg();
  const campaign = await ctx.db.query.campaigns.findFirst({
    where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.organizationId, ctx.organizationId)),
  });
  if (!campaign) notFound();

  const dataset = await assembleTruthDataset(ctx.organizationId);
  const truth = computeTruth(dataset, { scope: "campaign", filters: { campaignIds: [id] } });
  const row = truth.rows.find((r) => r.key === id) ?? truth.totals;

  const [attachments, buyers, suppliers, recentLeads] = await Promise.all([
    ctx.db.query.campaignBuyers.findMany({ where: eq(schema.campaignBuyers.campaignId, id) }),
    ctx.db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, ctx.organizationId) }),
    ctx.db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, ctx.organizationId) }),
    ctx.db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.campaignId, id), eq(schema.leads.organizationId, ctx.organizationId)))
      .orderBy(desc(schema.leads.receivedAt))
      .limit(40),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4780";
  const allowedSuppliers = suppliers.filter(
    (s) => s.allowedCampaignIds.length === 0 || s.allowedCampaignIds.includes(id)
  );

  return (
    <CampaignDetailClient
      campaign={{
        id: campaign.id, name: campaign.name, slug: campaign.slug, vertical: campaign.vertical,
        type: campaign.type, status: campaign.status, distributionMethod: campaign.distributionMethod,
        fieldMapping: campaign.fieldMapping, inboundFilters: campaign.inboundFilters,
        dedupeWindowDays: campaign.dedupeWindowDays, paymentTermsDays: campaign.paymentTermsDays,
        description: campaign.description, capiConfig: campaign.capiConfig,
      }}
      truth={{
        leads: row.performance.leads, sold: row.performance.sold, soldRate: row.performance.sold_rate,
        booked: row.booked.booked_revenue, verified: row.verified.verified_income,
        reportedProfit: row.booked.reported_profit, cashProfit: row.verified.cash_profit,
        gap: row.gap.revenue_gap, profitTruth: row.profit_truth, decision: row.decision,
        spendTracked: row.booked.media_cost_tracked, spendPaid: row.verified.media_spend_paid,
      }}
      routing={attachments
        .map((a) => ({
          buyerId: a.buyerId,
          name: buyers.find((b) => b.id === a.buyerId)?.name ?? a.buyerId,
          priority: a.priority,
          weight: a.weight,
          priceOverrideCents: a.priceOverrideCents,
          buyerStatus: buyers.find((b) => b.id === a.buyerId)?.status ?? "active",
        }))
        .sort((a, b) => a.priority - b.priority)}
      leads={recentLeads.map((l) => ({
        id: l.id,
        name: `${String(l.fieldData.first_name ?? "")} ${String(l.fieldData.last_name ?? "")}`.trim(),
        status: l.status, state: l.state, receivedAt: l.receivedAt.toISOString(),
        salePriceCents: l.salePriceCents, paidAllocatedCents: l.paidAllocatedCents, isTest: l.isTest,
      }))}
      ingest={{
        url: `${appUrl}/api/ingest/${campaign.slug}`,
        supplierName: allowedSuppliers[0]?.name ?? "your supplier",
        curl: buildCurl(appUrl, campaign.slug, campaign.fieldMapping),
      }}
    />
  );
}

function buildCurl(appUrl: string, slug: string, mapping: Array<{ key: string; type: string; options?: string[] }>): string {
  const sample: Record<string, string> = {};
  for (const f of mapping) {
    sample[f.key] =
      f.key === "first_name" ? "Jordan" : f.key === "last_name" ? "Rivera"
      : f.type === "phone" ? "(512) 555-0135" : f.type === "email" ? "jordan.rivera@example.com"
      : f.type === "date" ? "06/12/2026" : f.type === "state" ? "TX" : f.type === "zip" ? "78701"
      : f.type === "boolean" ? "no" : f.type === "select" ? (f.options?.[0] ?? "") : f.type === "number" ? "4"
      : f.key === "description" ? "Rear-ended at a stoplight" : "value";
  }
  const body = JSON.stringify(sample, null, 2).split("\n").join("\n  ");
  return `curl -X POST ${appUrl}/api/ingest/${slug} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: df_sup_leadflow_demo_4f8a2c91d7" \\
  -d '${body}'`;
}
