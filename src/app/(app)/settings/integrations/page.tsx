import { eq } from "drizzle-orm";
import { requireOrg } from "@/server/org";
import { schema } from "@/db/client";
import { IntegrationsClient } from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  const connectors = await ctx.db.query.connectorStatuses.findMany({
    where: eq(schema.connectorStatuses.organizationId, ctx.organizationId),
  });

  const forPlatform = (provider: string) => {
    const c = connectors.find((x) => x.provider === provider);
    return {
      status: c?.status ?? "inactive",
      lastSyncAt: c?.lastSyncAt?.toISOString() ?? null,
      notes: c?.notes ?? null,
      hasAppCredentials: Boolean(c?.config.app_id && c?.config.app_secret),
      hasToken: Boolean(c?.config.access_token),
      appId: String(c?.config.app_id ?? ""),
      verifyToken: String(c?.config.verify_token ?? ""),
    };
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4780";

  return (
    <IntegrationsClient
      meta={forPlatform("meta_ads")}
      google={forPlatform("google_ads")}
      tiktok={forPlatform("tiktok_ads")}
      appUrl={appUrl}
      notice={sp.connected ? `Connected: ${sp.connected}` : sp.error ? `Error: ${sp.error}` : null}
    />
  );
}
