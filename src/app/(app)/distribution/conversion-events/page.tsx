import { desc, eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { ConversionEventsClient } from "./ConversionEventsClient";

export const dynamic = "force-dynamic";

export default async function ConversionEventsPage() {
  const ctx = await requireOrg();
  const [campaigns, events] = await Promise.all([
    ctx.db.query.campaigns.findMany({ where: eq(schema.campaigns.organizationId, ctx.organizationId) }),
    ctx.db
      .select()
      .from(schema.capiEvents)
      .where(eq(schema.capiEvents.organizationId, ctx.organizationId))
      .orderBy(desc(schema.capiEvents.at))
      .limit(200),
  ]);

  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));

  return (
    <ConversionEventsClient
      campaigns={campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        capiConfig: c.capiConfig ?? { enabled: false, events: { received: false, sold: false } },
      }))}
      events={events.map((e) => ({
        id: e.id,
        campaign: campaignName.get(e.campaignId) ?? e.campaignId,
        leadId: e.leadId,
        eventName: e.eventName,
        status: e.status,
        payload: e.payload,
        response: e.response,
        at: e.at.toISOString(),
      }))}
      tokenConfigured={Boolean(process.env.META_CAPI_TOKEN)}
    />
  );
}
