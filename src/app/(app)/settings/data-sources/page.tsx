import { and, eq, isNull } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { connectorImpact } from "@/ai/tools";
import { DataSourcesClient } from "./DataSourcesClient";

export const dynamic = "force-dynamic";

export default async function DataSourcesPage() {
  const ctx = await requireOrg();
  const [connectors, rules, unmapped, campaigns] = await Promise.all([
    ctx.db.query.connectorStatuses.findMany({ where: eq(schema.connectorStatuses.organizationId, ctx.organizationId) }),
    ctx.db.query.spendMappingRules.findMany({ where: eq(schema.spendMappingRules.organizationId, ctx.organizationId) }),
    ctx.db
      .select()
      .from(schema.adSpendRecords)
      .where(and(eq(schema.adSpendRecords.organizationId, ctx.organizationId), isNull(schema.adSpendRecords.mappedCampaignId)))
      .limit(500),
    ctx.db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, ctx.organizationId) }),
  ]);

  // Roll unmapped rows up by ad campaign name.
  const unmappedGroups = new Map<string, { spendCents: number; rows: number }>();
  for (const r of unmapped) {
    const g = unmappedGroups.get(r.campaignName) ?? { spendCents: 0, rows: 0 };
    g.spendCents += r.spendCents;
    g.rows += 1;
    unmappedGroups.set(r.campaignName, g);
  }

  return (
    <DataSourcesClient
      connectors={connectors.map((c) => ({
        provider: c.provider, status: c.status,
        lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
        coveragePct: c.coveragePct, notes: c.notes,
        impact: connectorImpact(c.provider, c.status),
      }))}
      rules={rules.map((r) => ({
        id: r.id, pattern: r.pattern, matchField: r.matchField,
        targetCampaignId: r.targetCampaignId, brand: r.brand, active: r.active,
      }))}
      unmapped={[...unmappedGroups.entries()].map(([name, g]) => ({ name, ...g }))}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
