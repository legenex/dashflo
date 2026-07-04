import { and, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { CampaignWizard } from "./CampaignWizard";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await requireOrg();
  const [buyers, suppliers] = await Promise.all([
    ctx.db.query.buyers.findMany({ where: eq(schema.buyers.organizationId, ctx.organizationId) }),
    ctx.db.query.suppliers.findMany({ where: eq(schema.suppliers.organizationId, ctx.organizationId) }),
  ]);

  let existing = null;
  if (params.edit) {
    const campaign = await ctx.db.query.campaigns.findFirst({
      where: and(eq(schema.campaigns.id, params.edit), eq(schema.campaigns.organizationId, ctx.organizationId)),
    });
    if (campaign) {
      const attachments = await ctx.db.query.campaignBuyers.findMany({
        where: eq(schema.campaignBuyers.campaignId, campaign.id),
      });
      existing = {
        id: campaign.id, name: campaign.name, slug: campaign.slug, vertical: campaign.vertical,
        type: campaign.type, status: campaign.status, distributionMethod: campaign.distributionMethod,
        fieldMapping: campaign.fieldMapping, inboundFilters: campaign.inboundFilters,
        dedupeWindowDays: campaign.dedupeWindowDays, paymentTermsDays: campaign.paymentTermsDays,
        description: campaign.description ?? "",
        buyers: attachments.map((a) => ({
          buyerId: a.buyerId, priority: a.priority, weight: a.weight, priceOverrideCents: a.priceOverrideCents,
        })),
      };
    }
  }

  return (
    <CampaignWizard
      buyers={buyers.map((b) => ({ id: b.id, name: b.name, priceDefaultCents: b.priceDefaultCents }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, allowedCampaignIds: s.allowedCampaignIds }))}
      existing={existing}
    />
  );
}
