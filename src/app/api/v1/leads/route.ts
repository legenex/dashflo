import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gte, lte, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { apiOk, authenticateV1, requireScope } from "@/server/api-utils";
import { serializeLead } from "@/server/serializers";

export const dynamic = "force-dynamic";

// GET /api/v1/leads?status=&campaign=&buyer=&supplier=&from=&to=&cursor=&limit=
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "leads:read");
  if (scopeErr) return scopeErr;

  const url = new URL(req.url);
  const db = await getDb();
  const conditions = [eq(schema.leads.organizationId, authResult.auth.organizationId)];

  const status = url.searchParams.get("status");
  if (status) conditions.push(eq(schema.leads.status, status as "sold"));
  const campaign = url.searchParams.get("campaign");
  if (campaign) {
    const c = await db.query.campaigns.findFirst({
      where: and(
        eq(schema.campaigns.organizationId, authResult.auth.organizationId),
        eq(schema.campaigns.slug, campaign)
      ),
    });
    conditions.push(eq(schema.leads.campaignId, c?.id ?? "none"));
  }
  const buyer = url.searchParams.get("buyer");
  if (buyer) conditions.push(eq(schema.leads.buyerId, buyer));
  const supplier = url.searchParams.get("supplier");
  if (supplier) conditions.push(eq(schema.leads.supplierId, supplier));
  const from = url.searchParams.get("from");
  if (from) conditions.push(gte(schema.leads.receivedAt, new Date(`${from}T00:00:00Z`)));
  const to = url.searchParams.get("to");
  if (to) conditions.push(lte(schema.leads.receivedAt, new Date(`${to}T23:59:59Z`)));
  const cursor = url.searchParams.get("cursor");
  if (cursor) conditions.push(lt(schema.leads.receivedAt, new Date(cursor)));

  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));
  const rows = await db
    .select()
    .from(schema.leads)
    .where(and(...conditions))
    .orderBy(desc(schema.leads.receivedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  return apiOk({
    data: page.map(serializeLead),
    next_cursor: hasMore ? page[page.length - 1].receivedAt.toISOString() : null,
  });
}
