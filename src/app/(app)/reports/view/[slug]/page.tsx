import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { ReportPageView, type ReportPageMeta } from "@/components/reports/ReportPageView";

export const dynamic = "force-dynamic";

export default async function ReportViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg();

  if (slug === "new") {
    const blank: ReportPageMeta = {
      id: null,
      name: "New Report Page",
      slug: "new-report-page",
      kind: "custom",
      description: "Custom report page",
      entityType: null,
      entityId: null,
      portalVisible: false,
      config: {
        cards: ["revenue", "net_revenue", "cost", "cpl", "profit", "net_profit", "total_leads", "sold_leads", "conv_rate"],
        widgets: [{ id: "w_state", type: "state_table", title: "State Performance", metrics: ["total_leads", "sold_leads", "conv_rate", "net_revenue", "cpl", "profit"] }],
        filters: [],
        customMetrics: [],
      },
    };
    return <ReportPageView page={blank} editable startInEdit />;
  }

  const page = await ctx.db.query.reportPages.findFirst({
    where: and(eq(schema.reportPages.organizationId, ctx.organizationId), eq(schema.reportPages.slug, slug)),
  });
  if (!page) notFound();

  let entityName: string | null = null;
  if (page.entityType === "buyer" && page.entityId) {
    entityName = (await ctx.db.query.buyers.findFirst({ where: eq(schema.buyers.id, page.entityId) }))?.name ?? null;
  } else if (page.entityType === "supplier" && page.entityId) {
    entityName = (await ctx.db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, page.entityId) }))?.name ?? null;
  } else if (page.entityType === "campaign" && page.entityId) {
    entityName = (await ctx.db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, page.entityId) }))?.name ?? null;
  }

  return (
    <ReportPageView
      page={{
        id: page.id, name: page.name, slug: page.slug, kind: page.kind,
        description: page.description, entityType: page.entityType, entityId: page.entityId,
        entityName, portalVisible: page.portalVisible, config: page.config,
      }}
      editable={["owner", "admin", "finance", "analyst"].includes(ctx.role)}
      startInEdit={sp.edit === "1"}
    />
  );
}
