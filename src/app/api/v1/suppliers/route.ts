import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { apiOk, authenticateV1, requireScope } from "@/server/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "suppliers:read");
  if (scopeErr) return scopeErr;

  const db = await getDb();
  const rows = await db.query.suppliers.findMany({
    where: eq(schema.suppliers.organizationId, authResult.auth.organizationId),
  });
  return apiOk({
    data: rows.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      pricing_model: s.pricingModel,
      fixed_price_cents: s.fixedPriceCents,
      rev_share_pct: s.revSharePct,
      payment_terms_days: s.paymentTermsDays,
      api_key_prefix: s.apiKeyPrefix,
    })),
  });
}
