import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { apiOk, authenticateV1, requireScope } from "@/server/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "buyers:read");
  if (scopeErr) return scopeErr;

  const db = await getDb();
  const rows = await db.query.buyers.findMany({
    where: eq(schema.buyers.organizationId, authResult.auth.organizationId),
  });
  return apiOk({
    data: rows.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      price_default_cents: b.priceDefaultCents,
      priority: b.priority,
      weight: b.weight,
      payment_terms_days: b.paymentTermsDays,
      caps: b.caps,
    })),
  });
}
