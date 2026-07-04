import { desc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { CostsClient } from "./CostsClient";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const ctx = await requireOrg();
  const [costs, campaigns, suppliers] = await Promise.all([
    ctx.db
      .select()
      .from(schema.costEntries)
      .where(eq(schema.costEntries.organizationId, ctx.organizationId))
      .orderBy(desc(schema.costEntries.date)),
    ctx.db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, ctx.organizationId) }),
    ctx.db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, ctx.organizationId) }),
  ]);
  return (
    <CostsClient
      costs={costs.map((c) => ({
        id: c.id, date: c.date, category: c.category, description: c.description,
        amountCents: c.amountCents, campaignId: c.campaignId, supplierId: c.supplierId,
        recurring: c.recurring, paidStatus: c.paidStatus,
      }))}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
