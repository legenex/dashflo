import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { apiOk, authenticateV1, requireScope } from "@/server/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "campaigns:read");
  if (scopeErr) return scopeErr;

  const db = await getDb();
  const rows = await db.query.campaigns.findMany({
    where: eq(schema.campaigns.organizationId, authResult.auth.organizationId),
  });
  return apiOk({
    data: rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      vertical: c.vertical,
      type: c.type,
      status: c.status,
      distribution_method: c.distributionMethod,
      dedupe_window_days: c.dedupeWindowDays,
      payment_terms_days: c.paymentTermsDays,
      field_mapping: c.fieldMapping,
    })),
  });
}
