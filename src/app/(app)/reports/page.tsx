import { asc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { seedDefaultReportPages } from "@/server/report-pages";
import { ReportsIndexClient } from "./ReportsIndexClient";

export const dynamic = "force-dynamic";

export default async function ReportsIndexPage() {
  const ctx = await requireOrg();
  // Self-heal: orgs created before the reports rebuild get the defaults.
  await seedDefaultReportPages(ctx.organizationId);

  const [pages, buyers, suppliers, campaigns] = await Promise.all([
    ctx.db.select().from(schema.reportPages).where(eq(schema.reportPages.organizationId, ctx.organizationId)).orderBy(asc(schema.reportPages.sortOrder), asc(schema.reportPages.name)),
    ctx.db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, ctx.organizationId) }),
    ctx.db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, ctx.organizationId) }),
    ctx.db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, ctx.organizationId) }),
  ]);

  return (
    <ReportsIndexClient
      pages={pages.map((p) => ({
        id: p.id, name: p.name, slug: p.slug, kind: p.kind, description: p.description,
        entityType: p.entityType, entityId: p.entityId, portalVisible: p.portalVisible,
        isDefault: p.isDefault,
        entityName:
          p.entityType === "buyer" ? buyers.find((b) => b.id === p.entityId)?.name ?? null
          : p.entityType === "supplier" ? suppliers.find((s) => s.id === p.entityId)?.name ?? null
          : p.entityType === "campaign" ? campaigns.find((c) => c.id === p.entityId)?.name ?? null
          : null,
      }))}
      buyers={buyers.map((b) => ({ id: b.id, name: b.name }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
