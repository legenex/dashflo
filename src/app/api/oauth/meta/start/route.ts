import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getOrgContext } from "@/server/org";
import { hmacSha256Hex } from "@/lib/hash";

export const dynamic = "force-dynamic";

// Browser login for Meta: redirects to the Facebook OAuth dialog using the
// app credentials stored on the meta_ads connector config. Requires a
// Facebook App with ads_read, pages_show_list, leads_retrieval, and
// business_management permissions.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));

  const db = await getDb();
  const connector = await db.query.connectorStatuses.findFirst({
    where: and(
      eq(schema.connectorStatuses.organizationId, ctx.organizationId),
      eq(schema.connectorStatuses.provider, "meta_ads")
    ),
  });
  const appId = String(connector?.config.app_id ?? "");
  if (!appId) {
    return NextResponse.redirect(new URL("/settings/integrations?error=missing_app_credentials", req.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const redirectUri = `${appUrl}/api/oauth/meta/callback`;
  const secret = process.env.AUTH_SECRET ?? "dashflo-dev-secret-change-in-production";
  const state = `${ctx.organizationId}.${hmacSha256Hex(secret, ctx.organizationId).slice(0, 16)}`;

  const dialog = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  dialog.searchParams.set("client_id", appId);
  dialog.searchParams.set("redirect_uri", redirectUri);
  dialog.searchParams.set("state", state);
  dialog.searchParams.set("scope", "ads_read,pages_show_list,leads_retrieval,business_management,pages_manage_ads");
  return NextResponse.redirect(dialog);
}
