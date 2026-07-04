import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { hmacSha256Hex } from "@/lib/hash";
import { completeMetaOAuth } from "@/server/integrations";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const [organizationId, signature] = state.split(".");
  const secret = process.env.AUTH_SECRET ?? "dashflo-dev-secret-change-in-production";

  if (!code || !organizationId || hmacSha256Hex(secret, organizationId).slice(0, 16) !== signature) {
    return NextResponse.redirect(new URL("/settings/integrations?error=oauth_state", req.url));
  }

  const db = await getDb();
  const connector = await db.query.connectorStatuses.findFirst({
    where: and(
      eq(schema.connectorStatuses.organizationId, organizationId),
      eq(schema.connectorStatuses.provider, "meta_ads")
    ),
  });
  const appId = String(connector?.config.app_id ?? "");
  const appSecret = String(connector?.config.app_secret ?? "");
  if (!appId || !appSecret) {
    return NextResponse.redirect(new URL("/settings/integrations?error=missing_app_credentials", req.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const result = await completeMetaOAuth({
    organizationId, code,
    redirectUri: `${appUrl}/api/oauth/meta/callback`,
    appId, appSecret,
  });

  return NextResponse.redirect(
    new URL(`/settings/integrations?${result.ok ? "connected=meta" : `error=${encodeURIComponent(result.message)}`}`, req.url)
  );
}
